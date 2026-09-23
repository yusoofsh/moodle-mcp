# 0.5.0 — Cloudflare Workers Free

- Add SQLite Durable Object deployment retaining password OAuth and curated tools.
- Add Workers-compatible hashing, bounded HTTP and workerd integration tests.
- Preserve OCI and stdio deployment. No automatic container database migration.

## 0.4.0 — 2026-09-23

- Add local password owner login inside the existing OAuth/PKCE and consent flow.
- Default to AUTH_MODE=password; existing GitHub users must set AUTH_MODE=github explicitly.
- Add a hidden-prompt password-hash helper, fixed-cost salted scrypt, persistent login attempt limits, and a single-verification concurrency guard.
- Invalidate old OAuth/browser sessions when the configured password hash changes, without deleting persistent data.
- Publish password-mode-tested amd64/arm64 OCI images through the existing GHCR pipeline.

# Changelog

## [0.1.0] — 2026-04-15

### Added

**Tools (13 total)**
- `moodle_get_site_info` — school name, Moodle version, enabled API status
- `moodle_list_courses` — all enrolled courses
- `moodle_get_course` — sections and activities
- `moodle_list_resources` — files and links grouped by course section
- `moodle_list_assignments` — assignments with due dates, grouped by section
- `moodle_get_assignment` — submission status and grade feedback
- `moodle_get_grades` — full grade report with category grouping
- `moodle_get_calendar_events` — upcoming events with optional course filter
- `moodle_list_quizzes` — quizzes with time limits and open/close dates
- `moodle_get_quiz_attempts` — past attempt history and grades
- `moodle_list_forums` — forum activities grouped by section
- `moodle_get_forum_discussions` — recent discussions with reply counts
- `moodle_get_notifications` — recent notifications with unread indicator

**MCP Resources**
- Course files exposed as MCP resources at `moodle://courses/{courseId}/files/{encodedUrl}`
- PDFs and text files readable directly by Claude
- Enables AI-powered document synthesis

**MCP Prompts**
- `summarize-course` — structured course summary
- `whats-due` — prioritized upcoming deadlines
- `build-study-notes` — builds a linked Obsidian vault from course materials
- `exam-prep` — study guide based on grades and quiz results
- `search-notes` — natural language search across course files

**Infrastructure**
- Token auth + username/password auth
- Graceful degradation: tools return helpful messages instead of crashing when a school's Moodle doesn't expose an API
- `supports()` helper on `MoodleClient` for capability detection
- Natural section grouping in all listing tools (preserves professor's structure)
