# Study Hub validation

The UI uses only `moodle_get_dashboard`, `moodle_get_tasks`, and `moodle_search_materials`. Their input/output and OAuth contracts remain unchanged. The resource is static HTML and does not fetch Moodle data during discovery. The file resource is tested by name, with the existing permission-denial assertion retained.

The synthetic browser test exercises the actual JavaScript at 375-pixel and 1280-pixel viewport widths. It checks that supplied HTML is rendered as text, that partial coverage stays explicit, that context is not shared before a click, that returned task-page offsets are followed, and that the mobile layout does not overflow horizontally. It does not access a real student account or submit coursework.

The one-time source and formatting preparation workflows remove themselves before release. Normal pull-request checks run with read-only repository permissions. Release review should require current-head source tests, the browser fixture and the registered-upstream ancestry check. No force reset is part of synchronization.

A successful Worker build is distinct from deployment and from rendering inside the real ChatGPT host. Record the final default-branch commit and deployment result separately. Do not treat an available host-context button as authorization to share content without the user's click.
