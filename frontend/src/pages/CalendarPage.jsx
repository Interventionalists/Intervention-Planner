import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Palette,
  Plus,
  Repeat2,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { PageHeading } from "../components/PageElements";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const availabilityHours = ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"];
const availabilityHourHeight = 49;
const availabilityColors = ["#2563eb", "#20804b", "#7a3db8", "#e8791a", "#d92d20", "#079bd8"];
const hours = ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"];
const hourRowHeight = 55;
const dayRowHeight = 49;
const visibleDayStartHour = 8;
const visibleDayEndHour = 17;
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fullWeekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const initialDate = new Date();
initialDate.setHours(0, 0, 0, 0);

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function formatDate(date, options) {
  return date.toLocaleDateString("en-US", options);
}

function getEventsForDate(date, calendarEvents) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return calendarEvents.filter((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    return startsAt < dayEnd && endsAt > dayStart;
  });
}

function getTimedEvents(date, calendarEvents, rowHeight) {
  const timelineStart = new Date(date);
  timelineStart.setHours(visibleDayStartHour, 0, 0, 0);
  const timelineEnd = new Date(date);
  timelineEnd.setHours(visibleDayEndHour, 0, 0, 0);
  const timelineEvents = getEventsForDate(date, calendarEvents)
    .map((event) => {
      const eventStart = new Date(event.starts_at);
      const eventEnd = new Date(event.ends_at);
      if (
        Number.isNaN(eventStart.getTime()) ||
        Number.isNaN(eventEnd.getTime()) ||
        eventEnd <= eventStart ||
        eventEnd <= timelineStart ||
        eventStart >= timelineEnd
      ) {
        return null;
      }

      const visibleStart = Math.max(eventStart.getTime(), timelineStart.getTime());
      const visibleEnd = Math.min(eventEnd.getTime(), timelineEnd.getTime());
      return {
        event,
        startOffset: (visibleStart - timelineStart.getTime()) / 60000,
        endOffset: (visibleEnd - timelineStart.getTime()) / 60000,
        lane: 0,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.startOffset - second.startOffset);

  const laneEnds = [];
  for (const item of timelineEvents) {
    let lane = laneEnds.findIndex((endOffset) => endOffset <= item.startOffset);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.endOffset;
  }

  return timelineEvents.map((item) => ({
    ...item,
    laneCount: laneEnds.length,
    top: (item.startOffset / 60) * rowHeight,
    height: ((item.endOffset - item.startOffset) / 60) * rowHeight,
  }));
}

function getEventTitle(event) {
  return event.title || event.event_type || "Calendar event";
}

function formatLocalDateTimeInput(value) {
  const date = new Date(value);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatLocalDateTimeForApi(value) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  return `${formatLocalDateTimeInput(date)}:00${sign}${hours}:${minutes}`;
}

function getDefaultMeetingForm(date) {
  const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9);
  const endsAt = new Date(startsAt.getTime() + 30 * 60000);
  const endsOn = new Date(startsAt);
  endsOn.setDate(endsOn.getDate() + 56);
  return {
    title: "",
    eventType: "meeting",
    startsAt: formatLocalDateTimeInput(startsAt),
    endsAt: formatLocalDateTimeInput(endsAt),
    location: "",
    repeatEveryWeeks: 0,
    weekdays: [startsAt.getDay() === 0 ? 6 : startsAt.getDay() - 1],
    endsOn: [
      endsOn.getFullYear(),
      String(endsOn.getMonth() + 1).padStart(2, "0"),
      String(endsOn.getDate()).padStart(2, "0"),
    ].join("-"),
  };
}

function getInviteeInitials(invitee, fallback) {
  const name = [invitee.first_name, invitee.last_name].filter(Boolean).join(" ").trim();
  return (name || fallback).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function getEventDescription(event) {
  const participants = (event.participants || []).map((participant) => participant.name);
  return [getEventTitle(event), ...participants].join(" · ");
}

function formatEventDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventDuration(startsAt, endsAt) {
  const durationMinutes = Math.round((new Date(endsAt) - new Date(startsAt)) / 60000);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return [
    hours ? `${hours} hr${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} min` : "",
  ].filter(Boolean).join(" ") || "Less than a minute";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getAvailabilityDayTimeline(day, busyTimes, people) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(17, 0, 0, 0);
  const timeline = busyTimes
    .map((busy) => {
      const start = new Date(busy.starts_at);
      const end = new Date(busy.ends_at);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start >= dayEnd ||
        end <= dayStart ||
        end <= start
      ) {
        return null;
      }
      const person = people.find((invitee) =>
        invitee.type === "user"
          ? invitee.id === busy.user_id
          : invitee.id === busy.student_id
      );
      if (!person) return null;
      const visibleStart = Math.max(start.getTime(), dayStart.getTime());
      const visibleEnd = Math.min(end.getTime(), dayEnd.getTime());
      return {
        person,
        start: visibleStart,
        end: visibleEnd,
        startOffset: (visibleStart - dayStart.getTime()) / 60000,
        endOffset: (visibleEnd - dayStart.getTime()) / 60000,
        lane: 0,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.startOffset - second.startOffset);

  const laneEnds = [];
  for (const item of timeline) {
    let lane = laneEnds.findIndex((endOffset) => endOffset <= item.startOffset);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.endOffset;
  }

  return timeline.map((item) => ({
    ...item,
    laneCount: laneEnds.length,
    top: (item.startOffset / 60) * availabilityHourHeight,
    height: ((item.endOffset - item.startOffset) / 60) * availabilityHourHeight,
  }));
}

function CalendarPage({ user }) {
  const [view, setView] = useState("week");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [colorDraft, setColorDraft] = useState("#172c50");
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorSaveError, setColorSaveError] = useState("");
  const [colorSaveMessage, setColorSaveMessage] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createColor, setCreateColor] = useState("#172c50");
  const [editingEvent, setEditingEvent] = useState(null);
  const [editScope, setEditScope] = useState("series");
  const [meetingForm, setMeetingForm] = useState(() => getDefaultMeetingForm(initialDate));
  const [invitees, setInvitees] = useState({ users: [], students: [] });
  const [selectedInvitees, setSelectedInvitees] = useState([]);
  const [inviteeBusyTimes, setInviteeBusyTimes] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [inviteeSearch, setInviteeSearch] = useState("");
  const [isLoadingInvitees, setIsLoadingInvitees] = useState(false);
  const [inviteesError, setInviteesError] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [deleteScope, setDeleteScope] = useState("series");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingMeeting, setIsDeletingMeeting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const closeModalButton = useRef(null);
  const eventTrigger = useRef(null);
  const weekStart = startOfWeek(selectedDate);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const calendarStart = startOfWeek(monthStart);
  const monthDates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const rangeStart = view === "month" ? calendarStart : weekStart;
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeStart.getDate() + (view === "month" ? 42 : 7));
  const selectedEvents = getEventsForDate(selectedDate, calendarEvents);
  const meetingDate = meetingForm.startsAt
    ? new Date(meetingForm.startsAt)
    : new Date();
  const availabilityDayStart = new Date(
    meetingDate.getFullYear(),
    meetingDate.getMonth(),
    meetingDate.getDate()
  );
  const availabilityDayEnd = new Date(availabilityDayStart);
  availabilityDayEnd.setDate(availabilityDayEnd.getDate() + 1);
  const eventDuration = selectedEvent
    ? formatEventDuration(selectedEvent.starts_at, selectedEvent.ends_at)
    : null;
  const canChangeEventColor = Boolean(
    selectedEvent &&
    (user?.role === "admin" || selectedEvent.organizer === user?.public_id)
  );
  const appElement = document.querySelector(".app");
  const computedStyles = appElement ? window.getComputedStyle(appElement) : null;
  const themeColorOptions = [
    { label: "Primary", color: computedStyles?.getPropertyValue("--primary").trim() || "#172c50" },
    { label: "Secondary", color: computedStyles?.getPropertyValue("--secondary").trim() || "#079bd8" },
    { label: "Accent", color: computedStyles?.getPropertyValue("--accent").trim() || "#48b7f2" },
  ];
  const basicColorOptions = [
    { label: "Red", color: "#d92d20" },
    { label: "Orange", color: "#e8791a" },
    { label: "Green", color: "#20804b" },
    { label: "Blue", color: "#2563eb" },
    { label: "Purple", color: "#7a3db8" },
    { label: "Gray", color: "#667085" },
  ];
  const availabilityTimeline = getAvailabilityDayTimeline(
    availabilityDayStart,
    inviteeBusyTimes,
    availabilityPeople
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      starts_at: rangeStart.toISOString(),
      ends_at: rangeEnd.toISOString(),
    });

    async function loadCalendarEvents() {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/calendar-events?${params}`,
          { signal: controller.signal }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            result?.detail || `Unable to load calendar events (${response.status}).`
          );
        }
        if (!Array.isArray(result?.events)) {
          throw new Error("The calendar events response has an unexpected format.");
        }
        setCalendarEvents(result.events);
      } catch (error) {
        if (error.name !== "AbortError") {
          setLoadError(error.message || "Unable to load calendar events.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadCalendarEvents();
    return () => controller.abort();
  }, [rangeStart.toISOString(), rangeEnd.toISOString(), calendarRefreshKey]);

  useEffect(() => {
    if (!isCreateOpen) return undefined;
    const controller = new AbortController();

    async function loadInvitees() {
      setIsLoadingInvitees(true);
      setInviteesError("");
      try {
        const response = await apiFetch(`${API_BASE_URL}/calendar-invitees`, {
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.detail || `Unable to load invitees (${response.status}).`);
        }
        if (!Array.isArray(result?.users) || !Array.isArray(result?.students)) {
          throw new Error("The invitees response has an unexpected format.");
        }
        setInvitees(result);
      } catch (error) {
        if (error.name !== "AbortError") {
          setInviteesError(error.message || "Unable to load invitees.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingInvitees(false);
      }
    }

    loadInvitees();
    return () => controller.abort();
  }, [isCreateOpen]);

  const availabilityPeopleKey = selectedInvitees
    .map((invitee) =>
      invitee.user_id
        ? `user:${invitee.user_id}`
        : `student:${invitee.student_id}`
    )
    .sort()
    .join("|");
  const availabilityPeople = selectedInvitees.map((selected, index) => {
    if (selected.user_id) {
      const invitee = invitees.users.find(
        (person) => person.public_id === selected.user_id
      );
      return {
        type: "user",
        id: selected.user_id,
        name: invitee
          ? [invitee.first_name, invitee.last_name].filter(Boolean).join(" ") ||
            "Staff member"
          : "Staff member",
        color: availabilityColors[index % availabilityColors.length],
        initials: getInviteeInitials(invitee || {}, "Staff"),
      };
    }

    const invitee = invitees.students.find(
      (person) => person.id === selected.student_id
    );
    return {
      type: "student",
      id: selected.student_id,
      name: invitee
        ? [invitee.first_name, invitee.last_name].filter(Boolean).join(" ") ||
          "Student"
        : "Student",
      color: availabilityColors[index % availabilityColors.length],
      initials: getInviteeInitials(invitee || {}, "Student"),
    };
  });

  useEffect(() => {
    if (!isCreateOpen || availabilityPeople.length === 0) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      starts_at: availabilityDayStart.toISOString(),
      ends_at: availabilityDayEnd.toISOString(),
    });
    availabilityPeople.forEach((invitee) => {
      params.append(
        invitee.type === "user" ? "user_ids" : "student_ids",
        String(invitee.id)
      );
    });

    async function loadInviteeAvailability() {
      setIsLoadingAvailability(true);
      setAvailabilityError("");
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/calendar-availability?${params}`,
          { signal: controller.signal }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.detail || `Unable to load availability (${response.status}).`);
        }
        if (!Array.isArray(result?.busy)) {
          throw new Error("The availability response has an unexpected format.");
        }
        setInviteeBusyTimes(result.busy);
        setAvailabilityError("");
      } catch (error) {
        if (error.name !== "AbortError") {
          setAvailabilityError(error.message || "Unable to load availability.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingAvailability(false);
      }
    }

    loadInviteeAvailability();
    return () => controller.abort();
  }, [
    isCreateOpen,
    availabilityPeopleKey,
    availabilityDayStart.getTime(),
    availabilityDayEnd.getTime(),
  ]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    closeModalButton.current?.focus();
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      eventTrigger.current?.focus();
    };
  }, [selectedEvent]);

  function moveCalendar(direction) {
    const nextDate = new Date(selectedDate);
    if (view === "month") {
      nextDate.setDate(1);
      nextDate.setMonth(nextDate.getMonth() + direction);
    } else {
      nextDate.setDate(nextDate.getDate() + direction * 7);
    }
    setSelectedDate(nextDate);
  }

  function openCreateMeeting() {
    setEditingEvent(null);
    setMeetingForm(getDefaultMeetingForm(selectedDate));
    setCreateColor(themeColorOptions[0].color);
    setEditScope("series");
    setSelectedInvitees([]);
    setInviteeSearch("");
    setInviteeBusyTimes([]);
    setAvailabilityError("");
    setCreateError("");
    setInviteesError("");
    setIsCreateOpen(true);
  }

  function openEditMeeting(event, scope = "series") {
    const recurrence = event.recurrence;
    const formStart =
      scope === "series"
        ? recurrence?.series_starts_at || event.series_starts_at || event.starts_at
        : event.starts_at;
    const formEnd =
      scope === "series"
        ? recurrence?.series_ends_at || event.series_ends_at || event.ends_at
        : event.ends_at;
    const formDefaults = getDefaultMeetingForm(new Date(formStart));
    setEditingEvent(event);
    setEditScope(scope);
    setMeetingForm({
      ...formDefaults,
      title: event.title || "",
      eventType: event.event_type || "meeting",
      startsAt: formatLocalDateTimeInput(formStart),
      endsAt: formatLocalDateTimeInput(formEnd),
      location: event.location || "",
      repeatEveryWeeks: recurrence?.every_n_weeks || 0,
      weekdays: recurrence?.weekdays || [],
      endsOn: recurrence?.ends_on || formDefaults.endsOn,
    });
    setCreateColor(event.color || themeColorOptions[0].color);
    setSelectedInvitees((event.participants || []).map((participant) => ({
      ...(participant.user_id ? { user_id: participant.user_id } : {}),
      ...(participant.student_id != null ? { student_id: participant.student_id } : {}),
    })));
    setInviteeSearch("");
    setInviteeBusyTimes([]);
    setAvailabilityError("");
    setCreateError("");
    setInviteesError("");
    setIsCreateOpen(true);
    setSelectedEvent(null);
  }

  function toggleInvitee(invitee) {
    const exists = selectedInvitees.some((selected) => invitee.user_id
      ? selected.user_id === invitee.user_id
      : selected.student_id === invitee.student_id);
    setAvailabilityError("");
    setInviteeBusyTimes([]);
    setSelectedInvitees((current) => {
      return exists
        ? current.filter((selected) => invitee.user_id
          ? selected.user_id !== invitee.user_id
          : selected.student_id !== invitee.student_id)
        : [...current, invitee];
    });
  }

  const normalizedInviteeSearch = inviteeSearch.trim().toLocaleLowerCase();
  const filteredUsers = invitees.users.filter((invitee) => [
    invitee.first_name,
    invitee.last_name,
    invitee.role,
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedInviteeSearch));
  const filteredStudents = invitees.students.filter((invitee) => [
    invitee.first_name,
    invitee.last_name,
    invitee.grade_level == null ? "" : `grade ${invitee.grade_level}`,
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedInviteeSearch));

  async function createMeeting(submitEvent) {
    submitEvent.preventDefault();
    setCreateError("");
    const startsAt = new Date(meetingForm.startsAt);
    const endsAt = new Date(meetingForm.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setCreateError("Choose a valid end time after the start time.");
      return;
    }
    if (meetingForm.repeatEveryWeeks > 0) {
      if (!meetingForm.weekdays.length) {
        setCreateError("Choose at least one weekday for this repeating meeting.");
        return;
      }
      const startWeekday = startsAt.getDay() === 0 ? 6 : startsAt.getDay() - 1;
      if (!meetingForm.weekdays.includes(startWeekday)) {
        setCreateError("Include the meeting's start day in the repeat weekdays.");
        return;
      }
      if (meetingForm.endsOn < meetingForm.startsAt.slice(0, 10)) {
        setCreateError("The repeat end date must be on or after the first meeting.");
        return;
      }
    }

    const schoolId = user?.school_id ?? user?.school;
    if (!schoolId) {
      setCreateError("The signed-in user does not have a school assigned.");
      return;
    }

    setIsCreatingMeeting(true);
    try {
      const payload = {
        school: Number(schoolId),
        title: meetingForm.title.trim(),
        event_type: meetingForm.eventType.trim() || "meeting",
        starts_at: formatLocalDateTimeForApi(meetingForm.startsAt),
        ends_at: formatLocalDateTimeForApi(meetingForm.endsAt),
        location: meetingForm.location.trim() || null,
        color: createColor,
        participants: selectedInvitees,
      };
      if (meetingForm.repeatEveryWeeks > 0) {
        payload.recurrence = {
          weekdays: meetingForm.weekdays,
          every_n_weeks: Number(meetingForm.repeatEveryWeeks),
          ends_on: meetingForm.endsOn,
        };
      }

      const requestUrl = editingEvent
        ? `${API_BASE_URL}/calendar-events/${encodeURIComponent(editingEvent.public_id)}?${new URLSearchParams({
          scope: editScope,
          occurrence_at: editingEvent.starts_at,
        })}`
        : `${API_BASE_URL}/calendar-events`;
      const response = await apiFetch(requestUrl, {
        method: editingEvent ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || `Unable to create the meeting (${response.status}).`);
      }
      if (!result?.event?.public_id) {
        throw new Error(`The ${editingEvent ? "updated" : "created"} meeting response has an unexpected format.`);
      }

      setSelectedDate(startsAt);
      setCalendarRefreshKey((current) => current + 1);
      setIsCreateOpen(false);
      setEditingEvent(null);
    } catch (error) {
      setCreateError(error.message || "Unable to create the meeting.");
    } finally {
      setIsCreatingMeeting(false);
    }
  }

  async function deleteMeeting() {
    if (!selectedEvent?.public_id) {
      setDeleteError("This meeting is missing its public ID and cannot be deleted.");
      return;
    }

    setIsDeletingMeeting(true);
    setDeleteError("");
    try {
      const params = new URLSearchParams({
        scope: deleteScope,
        occurrence_at: selectedEvent.starts_at,
      });
      const response = await apiFetch(
        `${API_BASE_URL}/calendar-events/${encodeURIComponent(selectedEvent.public_id)}?${params}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || `Unable to delete the meeting (${response.status}).`);
      }

      setSelectedEvent(null);
      setDeleteError("");
      setDeleteConfirmOpen(false);
      setCalendarRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(error.message || "Unable to delete the meeting.");
    } finally {
      setIsDeletingMeeting(false);
    }
  }

  async function saveEventColor() {
    if (!selectedEvent?.public_id) {
      setColorSaveError("This event is missing its public ID and cannot be updated.");
      return;
    }

    setIsSavingColor(true);
    setColorSaveError("");
    setColorSaveMessage("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/calendar-events/${encodeURIComponent(selectedEvent.public_id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: colorDraft }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.detail || `Unable to update the event color (${response.status}).`
        );
      }

      const updatedEvent = { ...selectedEvent, color: result?.event?.color ?? colorDraft };
      setSelectedEvent(updatedEvent);
      setCalendarEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.public_id === selectedEvent.public_id ? updatedEvent : event
        )
      );
      setColorDraft(updatedEvent.color);
      setColorSaveMessage("Event color saved.");
    } catch (error) {
      setColorSaveError(error.message || "Unable to update the event color.");
    } finally {
      setIsSavingColor(false);
    }
  }

  function renderEvent(event, compact = false, timedPosition = null) {
    const color = event.color || "var(--primary)";
    return (
      <button
        type="button"
        className={`calendar-event${compact ? " calendar-event-compact" : ""}${timedPosition ? ` calendar-timed-event${timedPosition.height < 48 ? " calendar-timed-event-short" : ""}` : ""}`}
        key={event.public_id || event.id}
        style={{
          borderColor: color,
          ...(timedPosition
            ? {
                top: `${timedPosition.top}px`,
                height: `${timedPosition.height}px`,
                left: `calc(${(timedPosition.lane / timedPosition.laneCount) * 100}% + 2px)`,
                width: `calc(${100 / timedPosition.laneCount}% - 4px)`,
                "--event-color": color,
              }
            : {}),
        }}
        title={timedPosition
          ? `${getEventTitle(event)} · ${formatTime(event.starts_at)}–${formatTime(event.ends_at)}`
          : getEventDescription(event)}
        aria-label={timedPosition
          ? `View details for ${getEventTitle(event)}, ${formatTime(event.starts_at)} to ${formatTime(event.ends_at)}`
          : `View details for ${getEventTitle(event)}`}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          eventTrigger.current = clickEvent.currentTarget;
          setColorDraft(event.color || themeColorOptions[0].color);
          setColorSaveError("");
          setColorSaveMessage("");
          setEditScope("series");
          setDeleteScope("series");
          setDeleteConfirmOpen(false);
          setDeleteError("");
          setSelectedEvent(event);
        }}
      >
        <strong>{getEventTitle(event)}</strong>
        {timedPosition && timedPosition.height >= 48 && (
          <span>
            {formatTime(event.starts_at)}–{formatTime(event.ends_at)}
          </span>
        )}
        {!timedPosition && event.participants?.length > 0 && (
          <small className="calendar-event-participants">
            {event.participants.map((participant) => participant.name).join(", ")}
          </small>
        )}
      </button>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Calendar"
        title={formatDate(selectedDate, { month: "long", day: "numeric", year: "numeric" })}
        subtitle="Plan intervention sessions and progress checks."
      />
      <div className="calendar-grid">
        <section className="card week-card">
          <div className="calendar-toolbar">
            <button type="button" onClick={() => moveCalendar(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>
              <ChevronLeft size={18} />
            </button>
            <strong>
              {view === "month"
                ? formatDate(selectedDate, { month: "long", year: "numeric" })
                : `Week of ${formatDate(weekStart, { month: "long", day: "numeric" })}`}
            </strong>
            <button type="button" onClick={() => moveCalendar(1)} aria-label={view === "month" ? "Next month" : "Next week"}>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="calendar-today-button" onClick={() => setSelectedDate(new Date())}>
              Today
            </button>
            <button type="button" className="calendar-new-meeting-button" onClick={openCreateMeeting}>
              <Plus size={15} aria-hidden="true" />
              New meeting
            </button>
            <div className="calendar-view-switch" role="group" aria-label="Calendar view">
              <button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>
                Month
              </button>
              <button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>
                Week
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="calendar-data-state" role="status">Loading calendar events…</p>
          ) : loadError ? (
            <p className="calendar-data-state error-state" role="alert">{loadError}</p>
          ) : view === "month" ? (
            <div className="month-calendar">
              <div className="month-grid month-weekdays">
                {weekDays.map((day) => <strong key={day}>{day}</strong>)}
              </div>
              <div className="month-grid month-days">
                {monthDates.map((date) => {
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const dateEvents = getEventsForDate(date, calendarEvents);
                  return (
                    <div
                      key={date.toISOString()}
                      className={`month-day${isCurrentMonth ? "" : " outside-month"}${isSelected ? " selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="month-date-select"
                        onClick={() => setSelectedDate(date)}
                        aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        aria-pressed={isSelected}
                      >
                        {date.getDate()}
                      </button>
                      {dateEvents.map((event) => renderEvent(event, true))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="week-calendar">
              <div className="week-grid">
                <div className="week-time-gutter" aria-hidden="true" />
                {weekDates.map((date) => {
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      type="button"
                      className={`week-day-heading${isSelected ? " selected" : ""}`}
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      aria-pressed={isSelected}
                    >
                      <strong>{weekDays[(date.getDay() + 6) % 7]}</strong>
                      <span className="day-number">{date.getDate()}</span>
                    </button>
                  );
                })}
                <div className="week-time-axis" aria-hidden="true">
                  {hours.map((hour) => (
                    <span className="week-time-label" key={hour}>{hour}</span>
                  ))}
                </div>
                <div className="week-events-grid">
                  {weekDates.map((date) => (
                    <div className="week-event-day" key={date.toISOString()}>
                      {getTimedEvents(date, calendarEvents, hourRowHeight).map(
                        ({ event, top, height, lane, laneCount }) =>
                          renderEvent(event, true, { top, height, lane, laneCount })
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="card day-card">
          <h2>{formatDate(selectedDate, { month: "numeric", day: "numeric", year: "2-digit" })}</h2>
          {!isLoading && !loadError && selectedEvents.length === 0 && (
            <p className="calendar-empty-day">No events scheduled.</p>
          )}
          {loadError ? (
            <p className="calendar-empty-day error-state" role="alert">{loadError}</p>
          ) : !isLoading && (
            <div className="day-schedule-grid">
              <div className="day-schedule-hours" aria-hidden="true">
                {hours.map((hour) => <span key={hour}>{hour}</span>)}
              </div>
              <div className="day-schedule-timeline">
                {getTimedEvents(selectedDate, calendarEvents, dayRowHeight).map(
                  ({ event, top, height, lane, laneCount }) =>
                    renderEvent(event, false, { top, height, lane, laneCount })
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      {isCreateOpen && (
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isCreatingMeeting) {
              setIsCreateOpen(false);
            }
          }}
        >
          <section
            className={`calendar-event-modal calendar-create-modal${availabilityPeople.length ? " calendar-create-modal-with-availability" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-create-title"
          >
            <header className="calendar-event-modal-header">
              <div>
                <p className="calendar-event-modal-eyebrow">Calendar</p>
                <h2 id="calendar-create-title">{editingEvent ? "Edit meeting" : "Create a meeting"}</h2>
                <p className="calendar-event-modal-subtitle">
                  {editingEvent ? "Update the meeting details and invited people." : "Set the details and invite people from your school."}
                </p>
              </div>
              <button
                type="button"
                className="calendar-event-modal-close"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close new meeting form"
                disabled={isCreatingMeeting}
              >
                <X size={18} />
              </button>
            </header>
            <form className="calendar-create-form" onSubmit={createMeeting}>
              <div className="calendar-create-fields">
                <label>
                  Meeting title
                  <input
                    type="text"
                    value={meetingForm.title}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, title: event.target.value }))}
                    maxLength={200}
                    required
                    placeholder="e.g. Reading intervention"
                  />
                </label>
                <label>
                  Meeting type
                  <input
                    type="text"
                    value={meetingForm.eventType}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, eventType: event.target.value }))}
                    maxLength={100}
                    required
                    placeholder="Meeting"
                  />
                </label>
                <label>
                  Starts
                  <input
                    type="datetime-local"
                    value={meetingForm.startsAt}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, startsAt: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="datetime-local"
                    value={meetingForm.endsAt}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, endsAt: event.target.value }))}
                    required
                  />
                </label>
                <label className="calendar-create-location">
                  Location
                  <input
                    type="text"
                    value={meetingForm.location}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, location: event.target.value }))}
                    maxLength={300}
                    placeholder="Room or meeting link"
                  />
                </label>
              </div>

              <fieldset className="calendar-create-repeat calendar-create-color">
                <legend>Event color</legend>
                <p>Choose a theme color, a basic color, or pick your own.</p>
                <div className="calendar-color-options">
                  {[...themeColorOptions, ...basicColorOptions].map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      className={`calendar-color-option${createColor.toLowerCase() === option.color.toLowerCase() ? " selected" : ""}`}
                      onClick={() => setCreateColor(option.color)}
                      aria-label={`${option.label} event color`}
                      aria-pressed={createColor.toLowerCase() === option.color.toLowerCase()}
                      title={option.label}
                    >
                      <span style={{ backgroundColor: option.color }} />
                      <small>{option.label}</small>
                    </button>
                  ))}
                  <label className={`calendar-color-option calendar-custom-color-option${![...themeColorOptions, ...basicColorOptions].some((option) => option.color.toLowerCase() === createColor.toLowerCase()) ? " selected" : ""}`}>
                    <span className="calendar-custom-color-swatch" style={{ backgroundColor: createColor }}>
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(createColor) ? createColor : "#172c50"}
                        onChange={(event) => setCreateColor(event.target.value)}
                        aria-label="Choose a custom event color"
                      />
                    </span>
                    <small>Custom</small>
                  </label>
                </div>
              </fieldset>

              {!(editingEvent?.recurrence && editScope === "occurrence") && (
              <fieldset className="calendar-create-repeat">
                <legend>Repeats</legend>
                <label className="calendar-create-repeat-select">
                  Repeat
                  <select
                    value={meetingForm.repeatEveryWeeks}
                    onChange={(event) => setMeetingForm((current) => ({
                      ...current,
                      repeatEveryWeeks: Number(event.target.value),
                    }))}
                  >
                    <option value={0}>Does not repeat</option>
                    <option value={1}>Every week</option>
                    <option value={2}>Every 2 weeks</option>
                    <option value={3}>Every 3 weeks</option>
                    <option value={4}>Every 4 weeks</option>
                  </select>
                </label>
                {meetingForm.repeatEveryWeeks > 0 && (
                  <>
                    <div className="calendar-create-weekdays">
                      <span>Repeat on</span>
                      <div className="calendar-weekday-buttons" role="group" aria-label="Repeat on weekdays">
                        {weekDays.map((day, index) => (
                          <button
                            type="button"
                            key={fullWeekDays[index]}
                            className={meetingForm.weekdays.includes(index) ? "selected" : ""}
                            aria-label={fullWeekDays[index]}
                            title={fullWeekDays[index]}
                            aria-pressed={meetingForm.weekdays.includes(index)}
                            onClick={() => setMeetingForm((current) => ({
                              ...current,
                              weekdays: current.weekdays.includes(index)
                                ? current.weekdays.filter((weekday) => weekday !== index)
                                : [...current.weekdays, index].sort((weekdayA, weekdayB) => weekdayA - weekdayB),
                            }))}
                          >
                            {day[0]}
                          </button>
                        ))}
                      </div>
                      <small>Select one or more days. Include the start day.</small>
                      {meetingForm.weekdays.length > 0 && (
                        <strong className="calendar-create-weekday-summary">
                          Repeats on {meetingForm.weekdays.map((day) => weekDays[day]).join(", ")}
                        </strong>
                      )}
                    </div>
                    <label className="calendar-create-repeat-select">
                      Repeat until
                      <input
                        type="date"
                        value={meetingForm.endsOn}
                        min={meetingForm.startsAt.slice(0, 10)}
                        onChange={(event) => setMeetingForm((current) => ({ ...current, endsOn: event.target.value }))}
                        required
                      />
                    </label>
                  </>
                )}
              </fieldset>
              )}

              <fieldset className={`calendar-create-invitees${availabilityPeople.length ? " availability-open" : ""}`}>
                <legend>Invite people</legend>
                <div className="calendar-invitee-picker">
                  <label className="calendar-invitee-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      value={inviteeSearch}
                      onChange={(event) => setInviteeSearch(event.target.value)}
                      placeholder="Search staff and students"
                      aria-label="Search staff and students to invite"
                    />
                  </label>
                  {isLoadingInvitees ? (
                    <p className="calendar-invitees-state" role="status">Loading people from your school…</p>
                  ) : inviteesError ? (
                    <p className="calendar-invitees-state error-state" role="alert">{inviteesError}</p>
                  ) : (
                    <div className="calendar-invitee-groups">
                      <div>
                        <h3>Staff</h3>
                        {filteredUsers.length ? filteredUsers.map((invitee) => (
                        <label className="calendar-invitee-option" key={invitee.public_id}>
                          <input
                            type="checkbox"
                            checked={selectedInvitees.some((selected) => selected.user_id === invitee.public_id)}
                            onChange={() => toggleInvitee({ user_id: invitee.public_id })}
                          />
                          <span className="calendar-invitee-avatar" aria-hidden="true">
                            {getInviteeInitials(invitee, "Staff")}
                          </span>
                          <span>{[invitee.first_name, invitee.last_name].filter(Boolean).join(" ") || "Staff member"}</span>
                          <small>{invitee.role}</small>
                        </label>
                        )) : <p className="calendar-invitees-state">{invitees.users.length ? "No staff match your search." : "No staff found."}</p>}
                      </div>
                      <div>
                        <h3>Students</h3>
                        {filteredStudents.length ? filteredStudents.map((invitee) => (
                        <label className="calendar-invitee-option" key={invitee.id}>
                          <input
                            type="checkbox"
                            checked={selectedInvitees.some((selected) => selected.student_id === invitee.id)}
                            onChange={() => toggleInvitee({ student_id: invitee.id })}
                          />
                          <span className="calendar-invitee-avatar student" aria-hidden="true">
                            {getInviteeInitials(invitee, "Student")}
                          </span>
                          <span>{[invitee.first_name, invitee.last_name].filter(Boolean).join(" ") || "Student"}</span>
                          {invitee.grade_level != null && <small>Grade {invitee.grade_level}</small>}
                        </label>
                        )) : <p className="calendar-invitees-state">{invitees.students.length ? "No students match your search." : "No students found."}</p>}
                      </div>
                    </div>
                  )}
                </div>
                {availabilityPeople.length > 0 && (
                  <section className="calendar-invitee-availability">
                    <header>
                      <div>
                        <strong>Availability for {availabilityPeople.length} invitee{availabilityPeople.length === 1 ? "" : "s"}</strong>
                        <small>
                          {formatEventDate(availabilityDayStart)}
                        </small>
                      </div>
                    </header>
                    <div className="calendar-availability-people">
                      {availabilityPeople.map((person) => (
                        <span key={`${person.type}:${person.id}`}>
                          <i style={{ backgroundColor: person.color }} aria-hidden="true">
                            {person.initials}
                          </i>
                          {person.name}
                        </span>
                      ))}
                    </div>
                    <p className="calendar-availability-hint">
                      Schedules are overlaid. Blank time is open for everyone.
                    </p>
                    {isLoadingAvailability ? (
                      <p className="calendar-invitees-state" role="status">Loading schedule…</p>
                    ) : availabilityError ? (
                      <p className="calendar-invitees-state error-state" role="alert">{availabilityError}</p>
                    ) : (
                      <div className="calendar-availability-timeline-grid">
                        <div className="calendar-availability-hours" aria-hidden="true">
                          {availabilityHours.map((hour) => <span key={hour}>{hour}</span>)}
                        </div>
                        <div className="calendar-availability-timeline">
                          {availabilityTimeline.map((item, index) => (
                            <div
                              className="calendar-availability-event"
                              key={`${item.person.type}:${item.person.id}:${item.start}:${index}`}
                              style={{
                                top: `${item.top}px`,
                                height: `${item.height}px`,
                                left: `calc(${(item.lane / item.laneCount) * 100}% + 2px)`,
                                width: `calc(${100 / item.laneCount}% - 4px)`,
                                "--availability-color": item.person.color,
                              }}
                              title={`${item.person.name} · ${formatTime(item.start)}–${formatTime(item.end)}`}
                            >
                              <strong>{item.person.initials}</strong>
                              {item.height >= 38 && (
                                <span>{formatTime(item.start)}–{formatTime(item.end)}</span>
                              )}
                            </div>
                          ))}
                          {!availabilityTimeline.length && (
                            <p className="calendar-availability-all-open">
                              No scheduled events — everyone is open.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </fieldset>

              {createError && <p className="calendar-create-error" role="alert">{createError}</p>}
              <footer className="calendar-create-actions">
                <button type="button" onClick={() => {
                  setIsCreateOpen(false);
                  setEditingEvent(null);
                }} disabled={isCreatingMeeting}>Cancel</button>
                <button type="submit" disabled={isCreatingMeeting || isLoadingInvitees || Boolean(inviteesError)}>
                  {isCreatingMeeting ? (editingEvent ? "Saving…" : "Creating…") : (editingEvent ? "Save changes" : "Create meeting")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {selectedEvent && (
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="calendar-event-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-modal-title"
          >
            <header className="calendar-event-modal-header">
              <div className="calendar-event-modal-title-wrap">
                <span className="calendar-event-modal-color" style={{ background: selectedEvent.color || "var(--primary)" }} />
                <div>
                  <div className="calendar-event-modal-badges">
                    <span className="calendar-event-modal-type">{selectedEvent.event_type || "Calendar event"}</span>
                  </div>
                  <h2 id="calendar-event-modal-title">{getEventTitle(selectedEvent)}</h2>
                </div>
              </div>
              <button
                ref={closeModalButton}
                type="button"
                className="calendar-event-modal-close"
                onClick={() => setSelectedEvent(null)}
                aria-label="Close event details"
              >
                <X size={18} />
              </button>
            </header>
            <div className="calendar-event-when">
              <CalendarDays size={18} aria-hidden="true" />
              <div>
                <strong>{formatEventDate(selectedEvent.starts_at)}</strong>
                <span>
                  {formatTime(selectedEvent.starts_at)} – {new Date(selectedEvent.starts_at).toDateString() === new Date(selectedEvent.ends_at).toDateString()
                    ? formatTime(selectedEvent.ends_at)
                    : formatEventDateTime(selectedEvent.ends_at)}
                  {eventDuration && ` · ${eventDuration}`}
                </span>
              </div>
            </div>
            {canChangeEventColor && (
              <section className="calendar-event-color-editor" aria-labelledby="calendar-event-color-heading">
                <h3 id="calendar-event-color-heading"><Palette size={16} aria-hidden="true" /> Event color</h3>
                <p>Use a theme color, choose a basic color, or pick your own.</p>
                <div className="calendar-color-options">
                  {[...themeColorOptions, ...basicColorOptions].map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      className={`calendar-color-option${colorDraft.toLowerCase() === option.color.toLowerCase() ? " selected" : ""}`}
                      onClick={() => {
                        setColorDraft(option.color);
                        setColorSaveError("");
                        setColorSaveMessage("");
                      }}
                      aria-label={`${option.label} event color`}
                      aria-pressed={colorDraft.toLowerCase() === option.color.toLowerCase()}
                      title={option.label}
                    >
                      <span style={{ backgroundColor: option.color }} />
                      <small>{option.label}</small>
                    </button>
                  ))}
                  <label className={`calendar-color-option calendar-custom-color-option${!([...themeColorOptions, ...basicColorOptions].some((option) => option.color.toLowerCase() === colorDraft.toLowerCase())) ? " selected" : ""}`}>
                    <span className="calendar-custom-color-swatch" style={{ backgroundColor: colorDraft }}>
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(colorDraft) ? colorDraft : "#172c50"}
                        onChange={(changeEvent) => {
                          setColorDraft(changeEvent.target.value);
                          setColorSaveError("");
                          setColorSaveMessage("");
                        }}
                        aria-label="Choose a custom event color"
                      />
                    </span>
                    <small>Custom</small>
                  </label>
                </div>
                <div className="calendar-color-actions">
                  {colorSaveError && <p className="calendar-color-message error-state" role="alert">{colorSaveError}</p>}
                  {colorSaveMessage && <p className="calendar-color-message success-state" role="status">{colorSaveMessage}</p>}
                  <button type="button" className="calendar-color-save" onClick={saveEventColor} disabled={isSavingColor || colorDraft.toLowerCase() === (selectedEvent.color || themeColorOptions[0].color).toLowerCase()}>
                    {isSavingColor ? "Saving…" : "Save color"}
                  </button>
                </div>
              </section>
            )}
            <div className="calendar-event-detail-grid">
              {selectedEvent.location && (
                <section className="calendar-event-detail-card">
                  <MapPin size={17} aria-hidden="true" />
                  <div>
                    <h3>Location</h3>
                    <p>{selectedEvent.location}</p>
                  </div>
                </section>
              )}
              {selectedEvent.organizer_name && (
                <section className="calendar-event-detail-card">
                  <UserRound size={17} aria-hidden="true" />
                  <div>
                    <h3>Organizer</h3>
                    <p>{selectedEvent.organizer_name}</p>
                  </div>
                </section>
              )}
              {selectedEvent.regarding_student_name && (
                <section className="calendar-event-detail-card">
                  <UsersRound size={17} aria-hidden="true" />
                  <div>
                    <h3>Regarding student</h3>
                    <p>{selectedEvent.regarding_student_name}</p>
                  </div>
                </section>
              )}
            </div>
            {selectedEvent.participants?.length > 0 && (
              <section className="calendar-event-section">
                <h3><UsersRound size={16} aria-hidden="true" /> Participants <span>{selectedEvent.participants.length}</span></h3>
                <ul className="calendar-event-participant-list">
                  {selectedEvent.participants.map((participant) => (
                    <li key={`${participant.user_id || "student"}-${participant.student_id || "user"}`}>
                      <span className="calendar-participant-avatar" aria-hidden="true">
                        {participant.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="calendar-participant-name">{participant.name}</span>
                      {participant.attendance && <small>{participant.attendance}</small>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(selectedEvent.recurrence || selectedEvent.recurrence_rule) && (
              <section className="calendar-event-section calendar-event-recurrence">
                <h3><Repeat2 size={16} aria-hidden="true" /> Repeats</h3>
                <p>
                  {selectedEvent.recurrence
                    ? `Every ${selectedEvent.recurrence.every_n_weeks || 1} week${selectedEvent.recurrence.every_n_weeks === 1 ? "" : "s"}`
                    : selectedEvent.recurrence_rule}
                  {selectedEvent.recurrence?.ends_on && ` · Through ${formatDate(new Date(`${selectedEvent.recurrence.ends_on}T00:00:00`), { month: "long", day: "numeric", year: "numeric" })}`}
                </p>
              </section>
            )}
            {canChangeEventColor && (
              <section className="calendar-meeting-actions">
                {deleteError && <p className="calendar-create-error" role="alert">{deleteError}</p>}
                <div className="calendar-meeting-action-buttons">
                  {selectedEvent.recurrence ? (
                    <div className="calendar-action-group">
                      <select
                        aria-label="Choose which meetings to edit"
                        value={editScope}
                        onChange={(event) => setEditScope(event.target.value)}
                        disabled={isDeletingMeeting}
                      >
                        <option value="series">Entire series</option>
                        <option value="future">This and future</option>
                        <option value="occurrence">This occurrence</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openEditMeeting(selectedEvent, editScope)}
                        disabled={isDeletingMeeting}
                      >
                        Edit meeting
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEditMeeting(selectedEvent)}
                      disabled={isDeletingMeeting}
                    >
                      Edit meeting
                    </button>
                  )}
                  {selectedEvent.recurrence ? (
                    <div className="calendar-action-group calendar-delete-action-group">
                      <select
                        aria-label="Choose which meetings to delete"
                        value={deleteScope}
                        onChange={(event) => {
                          setDeleteScope(event.target.value);
                          setDeleteError("");
                        }}
                        disabled={isDeletingMeeting}
                      >
                        <option value="series">Entire series</option>
                        <option value="future">This and future</option>
                        <option value="occurrence">This occurrence</option>
                      </select>
                      <button
                        type="button"
                        className="calendar-delete-meeting-button"
                        onClick={() => {
                          setDeleteError("");
                          setDeleteConfirmOpen(true);
                        }}
                        disabled={isDeletingMeeting}
                      >
                        Delete meeting
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="calendar-delete-meeting-button"
                      onClick={() => {
                        setDeleteError("");
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={isDeletingMeeting}
                    >
                      Delete meeting
                    </button>
                  )}
                </div>
                {deleteConfirmOpen && (
                  <div className="calendar-delete-confirm" role="alertdialog" aria-label="Confirm meeting deletion">
                    <p>
                      {!selectedEvent.recurrence
                        ? "Delete this meeting?"
                        : deleteScope === "series"
                        ? "Delete the entire meeting series?"
                        : deleteScope === "future"
                          ? "Delete this and all future occurrences?"
                          : "Delete only this occurrence?"}
                    </p>
                    <div className="calendar-meeting-action-buttons">
                      <button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeletingMeeting}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="calendar-delete-meeting-button"
                        onClick={deleteMeeting}
                        disabled={isDeletingMeeting}
                      >
                        {isDeletingMeeting ? "Deleting…" : "Confirm delete"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default CalendarPage;
