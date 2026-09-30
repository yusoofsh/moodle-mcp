import type { SqlAuthStore } from "../auth/sql-store.js";
import type { MoodleClient } from "../moodle-client.js";
import {
  EventHub,
  canonical,
  type EventDefinition,
  type EventStore,
  type Subscription,
  type Delivery,
  type WebhookPost,
  EventError,
} from "./core.js";
import { webhookPost } from "./webhook.js";
import { createHash } from "node:crypto";

export const moodleEvents: EventDefinition[] = [
  {
    name: "course.content.changed",
    description:
      "A module was added or changed in an enrolled Moodle course. Checks every 60 seconds while subscribed; payload contains references only.",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: { course_id: { type: "string" } },
      required: ["course_id"],
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        course_id: { type: "string" },
        module_id: { type: "string" },
        change: { type: "string" },
        url: { type: "string" },
      },
      required: ["course_id", "module_id", "change", "url"],
      additionalProperties: false,
    },
  },
];
export function moodleEventHub(
  store: SqlAuthStore,
  getClient: () => Promise<MoodleClient>,
  grantActive: (grant: string) => Promise<boolean>,
  post: WebhookPost = webhookPost,
) {
  const records = <T>(model: string) => store.list(model) as unknown as T[];
  const persistence: EventStore = {
    subscriptions: async () => records<Subscription>("EventSubscription"),
    putSubscription: async (s) =>
      store.put("EventSubscription", s.id, { ...s }),
    deleteSubscription: async (id) => {
      store.take("EventSubscription", id);
    },
    deliveries: async () => records<Delivery>("EventDelivery"),
    putDelivery: async (d) => store.put("EventDelivery", d.id, { ...d }),
    deleteDelivery: async (id) => {
      store.take("EventDelivery", id);
    },
  };
  const authorized = async (s: Pick<Subscription, "owner" | "arguments">) => {
    if (!(await grantActive(s.owner))) return false;
    const client = await getClient();
    const courses = await client.call<{ id: number }[]>(
      "core_enrol_get_users_courses",
      { userid: client.userId },
    );
    return courses.some((c) => String(c.id) === s.arguments.course_id);
  };
  const hub = new EventHub(moodleEvents, persistence, post, authorized);
  const snapshot = async (course: string) => {
    if (!/^[1-9]\d*$/.test(course)) throw new Error("Invalid course ID");
    const client = await getClient();
    const sections = await client.call<
      { modules: { id: number; url?: string; [key: string]: unknown }[] }[]
    >("core_course_get_contents", { courseid: Number(course) });
    const modules = sections.flatMap((s) => s.modules ?? []);
    if (modules.length > 1000)
      throw new Error("Course exceeds the event snapshot limit");
    return Object.fromEntries(
      modules.map((m) => [
        String(m.id),
        {
          hash: createHash("sha256").update(canonical(m)).digest("hex"),
          url: m.url ?? client.siteUrl + "/course/view.php?id=" + course,
        },
      ]),
    );
  };
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const subscriptions = (await persistence.subscriptions()).filter(
        (s) => s.expires > Date.now(),
      );
      for (const course of new Set(
        subscriptions.map((s) => s.arguments.course_id),
      )) {
        const allowed = [];
        for (const s of subscriptions.filter(
          (s) => s.arguments.course_id === course,
        )) {
          if (await authorized(s)) allowed.push(s);
          else await persistence.deleteSubscription(s.id);
        }
        if (!allowed.length) continue;
        const current = await snapshot(course);
        const old = store.get("EventSnapshot", course) as unknown as
          { modules: typeof current; observedAt: string } | undefined;
        const observedAt = new Date().toISOString();
        if (old)
          for (const [id, module] of Object.entries(current)) {
            if (old.modules[id]?.hash === module.hash) continue;
            const change = old.modules[id] ? "updated" : "created";
            const eventId =
              "evt_" +
              createHash("sha256")
                .update(
                  course + ":" + id + ":" + module.hash + ":" + old.observedAt,
                )
                .digest("hex");
            await hub.emit(
              "course.content.changed",
              { course_id: course, module_id: id, change, url: module.url },
              eventId,
              observedAt,
            );
          }
        // Advance only after all observed changes are durably queued.
        store.put("EventSnapshot", course, { modules: current, observedAt });
      }
      await hub.flush();
      for (const s of await persistence.subscriptions())
        if (s.expires <= Date.now()) await persistence.deleteSubscription(s.id);
    } finally {
      ticking = false;
    }
  };
  return {
    hub,
    tick,
    async prepare(course: string, owner: string) {
      if (!(await authorized({ owner, arguments: { course_id: course } })))
        throw new EventError(-32001, "Event resource access denied");
      if (!store.get("EventSnapshot", course))
        store.put("EventSnapshot", course, {
          modules: await snapshot(course),
          observedAt: new Date().toISOString(),
        });
    },
    async active() {
      return (await persistence.subscriptions()).some(
        (s) => s.expires > Date.now(),
      );
    },
  };
}
