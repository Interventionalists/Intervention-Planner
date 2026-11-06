## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `public_id` | `uuid` |  Unique |
| `email` | `varchar` |  Unique |
| `password_hash` | `text` |  Nullable |
| `first_name` | `varchar` |  |
| `last_name` | `varchar` |  |
| `role` | `user_role` |  |
| `school` | `int8` |  Nullable |
| `failed_login_attempts` | `int4` |  |
| `locked_until` | `timestamptz` |  Nullable |
| `last_failed_login_at` | `timestamptz` |  Nullable |

## Table `students`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `public_id` | `uuid` |  Unique |
| `first_name` | `varchar` |  |
| `last_name` | `varchar` |  |
| `grade_level` | `int2` |  Nullable |
| `teacher` | `uuid` |  Nullable |
| `interventionist` | `uuid` |  Nullable |
| `school` | `int8` |  Nullable |
| `profile_api_link` | `text` |  Nullable |
| `parent_name` | `text` |  Nullable |
| `parent_phone` | `text` |  Nullable |
| `group_number` | `int8` |  Nullable |

## Table `notes`

This is a table of all the different notes that are created for a student

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `date` | `date` |  |
| `text` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `student_id` | `int8` |  Nullable |
| `privateNote` | `bool` |  Nullable |

## Table `schools`

This table stores the different schools our users/students are in

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `school_id` | `int8` | Primary Identity |
| `school_name` | `varchar` |  |
| `school_logo_api` | `text` |  Nullable |

## Table `student_assignments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `student_id` | `int8` |  Nullable |
| `created_at` | `timestamptz` |  |
| `grade` | `numeric` |  Nullable |
| `class` | `text` |  Nullable |
| `Assignment` | `text` |  Nullable |

## Table `themes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `school_id` | `int8` |  Nullable Unique |
| `color_primary` | `varchar` |  Nullable |
| `color_secondary` | `varchar` |  Nullable |
| `color_tertiary` | `varchar` |  Nullable |

## Table `health_checks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `service` | `text` |  |
| `check_type` | `text` |  |
| `status` | `text` |  |
| `latency_ms` | `int4` |  Nullable |
| `details` | `jsonb` |  |
| `checked_at` | `timestamptz` |  |

## Table `state_test_scoring`

This holds the state test grades for the students.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `test_name` | `varchar` |  |
| `grade` | `int4` |  Nullable |
| `student` | `int8` |  Nullable |
| `year_taken` | `int4` |  Nullable |

## Table `student-subject-goals`

This is where we set and look at the grading goals for each student.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `student_id` | `uuid` |  Nullable |
| `math` | `numeric` |  Nullable |
| `english` | `numeric` |  Nullable |
| `social_studies` | `numeric` |  Nullable |
| `science` | `numeric` |  Nullable |
| `art` | `numeric` |  Nullable |
| `p_e` | `numeric` |  Nullable |

## Table `calendar_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `public_id` | `uuid` |  Unique |
| `event_type` | `text` |  |
| `school` | `int8` |  |
| `organizer` | `uuid` |  |
| `title` | `varchar` |  Nullable |
| `starts_at` | `timestamptz` |  |
| `ends_at` | `timestamptz` |  |
| `location` | `text` |  Nullable |
| `series_id` | `uuid` |  Nullable |
| `recurrence_rule` | `text` |  Nullable |
| `regarding_student` | `int8` |  Nullable |
| `created_at` | `timestamptz` |  |
| `session_group_id` | `int8` |  Nullable |
| `color` | `varchar` |  Nullable |
| `recurrence_id` | `int8` |  Nullable |

## Table `event_participants`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `event_id` | `int8` |  |
| `user_id` | `uuid` |  Nullable |
| `student_id` | `int8` |  Nullable |
| `attendance` | `text` |  |

## Table `session_details`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `event_id` | `int8` | Primary |
| `plan_type` | `text` |  Nullable |
| `focus` | `text` |  Nullable |
| `student_id` | `int8` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `duration` | `int8` |  Nullable |
| `scheduled_time` | `timestamptz` |  Nullable |
| `status` | `text` |  Nullable |

## Table `session_groups`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `public_id` | `uuid` |  Unique |
| `school` | `int8` |  |
| `name` | `varchar` |  |
| `purpose` | `text` |  |
| `interventionist` | `uuid` |  Nullable |

## Table `session_group_members`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `group_id` | `int8` | Primary |
| `student_id` | `int8` | Primary |
| `added_by` | `uuid` |  Nullable |

## Table `event_recurrence`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `weekdays` | `_int2` |  |
| `every_n_weeks` | `int4` |  |
| `ends_on` | `date` |  |

## Custom Types / Enums

### `avalible_roles`

`teacher` | `interventionist` | `admin`

### `user_role`

`teacher` | `interventionist` | `admin`

