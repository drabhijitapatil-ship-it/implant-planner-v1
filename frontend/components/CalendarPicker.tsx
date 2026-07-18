/**
 * iter-365 (revised iter-366) — Reusable Calendar Picker
 *
 * Two visual modes:
 *   • Default (inline)  — used inside Phase-1 scheduling forms.
 *     Calendar drops down below the trigger, blocking future/past
 *     dates per `allowPast` / `allowFuture` flags.
 *   • `compact` (modal) — used in the analytics filter rows where
 *     multiple pickers sit side-by-side. Trigger takes flex:1 of its
 *     parent row; opening the picker mounts a centered Modal that
 *     never spills off-screen.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  allowPast?: boolean;
  allowFuture?: boolean;
  compact?: boolean;
  testID?: string;
  variant?: "blue" | "standard";
  style?: any;
};

export default function CalendarPicker({
  value,
  onChange,
  label,
  placeholder = "Select Date",
  required,
  allowPast = false,
  allowFuture = true,
  compact,
  testID,
  variant = "blue",
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"day" | "month" | "year">("day");
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    value ? parseInt(value.split("-")[0]) : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    value ? parseInt(value.split("-")[1]) - 1 : today.getMonth(),
  );
  // Year grid start (12 years shown at a time). Aligns to a 12-year block containing current viewYear.
  const [yearPage, setYearPage] = useState(() => {
    const y = value ? parseInt(value.split("-")[0]) : today.getFullYear();
    return y - (y % 12);
  });

  // ─── Year-range guard (per iter-367 · choice 1a) ───
  const MIN_YEAR = 1950;
  const MAX_YEAR = today.getFullYear() + 5;

  // Selected year/month from `value` for cross-view highlight
  const selYear = value ? parseInt(value.split("-")[0]) : null;
  const selMonth = value ? parseInt(value.split("-")[1]) - 1 : null;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
    setView("day");
  };

  const clear = () => {
    onChange("");
    setOpen(false);
    setView("day");
  };

  const jumpToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setYearPage(today.getFullYear() - (today.getFullYear() % 12));
    setView("day");
  };

  // ─── Disabled predicates for month & year views ───
  const isMonthDisabled = (m: number) => {
    const first = new Date(viewYear, m, 1);
    const last = new Date(viewYear, m + 1, 0);
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (!allowPast && last < todayMid) return true;
    if (!allowFuture && first > todayMid) return true;
    return false;
  };
  const isYearDisabled = (y: number) => {
    if (y < MIN_YEAR || y > MAX_YEAR) return true;
    if (!allowPast && y < today.getFullYear()) return true;
    if (!allowFuture && y > today.getFullYear()) return true;
    return false;
  };

  const isDisabled = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (!allowPast && date < todayMidnight) return true;
    if (!allowFuture && date > todayMidnight) return true;
    return false;
  };

  const isSelected = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return value === `${viewYear}-${m}-${d}`;
  };

  const isToday = (day: number) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // ── The calendar body — three views: day / month / year ──
  const CalendarBody = (
    <View style={compact ? cs.calCompact : cs.calendar}>
      {/* Header — chevrons + tappable title that drills up a level */}
      <View style={cs.calHeader}>
        <TouchableOpacity
          onPress={() => {
            if (view === "day") prevMonth();
            else if (view === "month")
              setViewYear(Math.max(MIN_YEAR, viewYear - 1));
            else setYearPage(Math.max(MIN_YEAR, yearPage - 12));
          }}
          style={cs.navBtn}
          testID="cal-prev"
        >
          <Ionicons name="chevron-back" size={18} color="#1A73E8" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (view === "day") setView("month");
            else if (view === "month") {
              setYearPage(viewYear - (viewYear % 12));
              setView("year");
            }
          }}
          style={cs.headerTitleBtn}
          testID="cal-header-title"
          disabled={view === "year"}
        >
          <Text style={cs.monthYear}>
            {view === "day" && `${monthNames[viewMonth]} ${viewYear}`}
            {view === "month" && `${viewYear}`}
            {view === "year" && `${yearPage} – ${yearPage + 11}`}
          </Text>
          {view !== "year" && (
            <Ionicons name="chevron-down" size={14} color="#1A73E8" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (view === "day") nextMonth();
            else if (view === "month")
              setViewYear(Math.min(MAX_YEAR, viewYear + 1));
            else setYearPage(Math.min(MAX_YEAR - 11, yearPage + 12));
          }}
          style={cs.navBtn}
          testID="cal-next"
        >
          <Ionicons name="chevron-forward" size={18} color="#1A73E8" />
        </TouchableOpacity>
      </View>

      {/* Day view */}
      {view === "day" && (
        <>
          <View style={cs.weekRow}>
            {dayNames.map((dn) => (
              <View key={dn} style={cs.dayHead}>
                <Text style={cs.dayHeadTxt}>{dn}</Text>
              </View>
            ))}
          </View>
          <View style={cs.gridWrap}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={cs.dayCell} />;
              const disabled = isDisabled(day);
              const selected = isSelected(day);
              const todayFlag = isToday(day);
              return (
                <TouchableOpacity
                  key={idx}
                  disabled={disabled}
                  onPress={() => selectDate(day)}
                  style={cs.dayCell}
                  testID={`cal-day-${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`}
                >
                  <View
                    style={[
                      cs.cellInner,
                      selected && cs.dayCellSelected,
                      !selected && todayFlag && cs.dayCellToday,
                    ]}
                  >
                    <Text
                      style={[
                        cs.dayTxt,
                        disabled && { color: "#CFD8DC" },
                        selected && { color: "#FFF", fontWeight: "700" },
                        !selected &&
                          todayFlag && { color: "#1A73E8", fontWeight: "700" },
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Month view — 12-tile grid */}
      {view === "month" && (
        <View style={cs.tileGrid}>
          {monthNames.map((mn, mi) => {
            const disabled = isMonthDisabled(mi);
            const selected = selYear === viewYear && selMonth === mi;
            const isThisMonth =
              viewYear === today.getFullYear() && mi === today.getMonth();
            return (
              <TouchableOpacity
                key={mn}
                disabled={disabled}
                onPress={() => {
                  setViewMonth(mi);
                  setView("day");
                }}
                style={[
                  cs.tile,
                  selected && cs.tileSelected,
                  !selected && isThisMonth && cs.tileToday,
                ]}
                testID={`cal-month-${mi + 1}`}
              >
                <Text
                  style={[
                    cs.tileTxt,
                    disabled && { color: "#CFD8DC" },
                    selected && { color: "#FFF", fontWeight: "800" },
                    !selected &&
                      isThisMonth && { color: "#1A73E8", fontWeight: "800" },
                  ]}
                >
                  {mn.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Year view — 12-year grid */}
      {view === "year" && (
        <View style={cs.tileGrid}>
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => {
            const disabled = isYearDisabled(y);
            const selected = selYear === y;
            const isThisYear = y === today.getFullYear();
            return (
              <TouchableOpacity
                key={y}
                disabled={disabled}
                onPress={() => {
                  setViewYear(y);
                  setView("month");
                }}
                style={[
                  cs.tile,
                  selected && cs.tileSelected,
                  !selected && isThisYear && cs.tileToday,
                ]}
                testID={`cal-year-${y}`}
              >
                <Text
                  style={[
                    cs.tileTxt,
                    disabled && { color: "#CFD8DC" },
                    selected && { color: "#FFF", fontWeight: "800" },
                    !selected &&
                      isThisYear && { color: "#1A73E8", fontWeight: "800" },
                  ]}
                >
                  {y}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {compact && (
        <View style={cs.modalFooter}>
          <TouchableOpacity
            onPress={clear}
            style={cs.footerBtn}
            testID={`${testID || "calendar"}-modal-clear`}
          >
            <Ionicons name="trash-outline" size={14} color="#78909C" />
            <Text style={cs.footerBtnTxt}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={jumpToToday}
            style={[cs.footerBtn, { backgroundColor: "#E3F2FD" }]}
            testID={`${testID || "calendar"}-modal-today`}
          >
            <Ionicons name="today-outline" size={14} color="#1565C0" />
            <Text
              style={[cs.footerBtnTxt, { color: "#1565C0", fontWeight: "700" }]}
            >
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setOpen(false);
              setView("day");
            }}
            style={[cs.footerBtn, { backgroundColor: "#F5F7FB" }]}
            testID={`${testID || "calendar"}-modal-close`}
          >
            <Text
              style={[cs.footerBtnTxt, { color: "#1A2332", fontWeight: "700" }]}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={[compact ? cs.wrapCompact : cs.wrap, style]}>
      {label ? (
        <Text style={cs.label}>
          {label}
          {required && <Text style={{ color: "#DC3545" }}> *</Text>}
        </Text>
      ) : null}
      <TouchableOpacity
        style={compact ? (variant === "standard" ? cs.triggerCompactStandard : cs.triggerCompact) : cs.trigger}
        onPress={() => setOpen(!open)}
        testID={testID || "calendar-trigger"}
        /* @ts-ignore */ data-testid={testID || "calendar-trigger"}
      >
        <Text
          style={[
            compact ? (variant === "standard" ? cs.triggerTxtCompactStandard : cs.triggerTxtCompact) : cs.triggerTxt,
            !value && { color: "#B0BEC5" },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {value ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                clear();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`${testID || "calendar"}-clear`}
            >
              <Ionicons name="close-circle" size={14} color="#90A4AE" />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="calendar-outline" size={14} color="#546E7A" />
        </View>
      </TouchableOpacity>

      {/* Inline (non-compact) — drops below trigger */}
      {!compact && open && CalendarBody}

      {/* Compact — modal so it never spills off-screen */}
      {compact && (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => {
            setOpen(false);
            setView("day");
          }}
        >
          <Pressable
            style={cs.backdrop}
            onPress={() => {
              setOpen(false);
              setView("day");
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={cs.modalCenter}
            >
              {CalendarBody}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapCompact: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#546E7A",
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CFD8DC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFF",
  },
  triggerCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#1E88E5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#E3F2FD",
    minHeight: 42,
    shadowColor: "#1E88E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  triggerCompactStandard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFF",
    minHeight: 42,
  },
  triggerTxt: { fontSize: 13, color: "#1A2332", fontWeight: "600" },
  triggerTxtCompact: {
    fontSize: 13,
    color: "#0D47A1",
    fontWeight: "700",
    flex: 1,
    marginRight: 6,
  },
  triggerTxtCompactStandard: {
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
    flex: 1,
    marginRight: 6,
  },

  // Inline calendar body (Phase-1 scheduling form)
  calendar: {
    marginTop: 6,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E1E7EF",
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  // Compact calendar body (rendered inside centered modal)
  calCompact: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    width: 300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },

  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F0F4F8",
  },
  navBtn: { padding: 6, borderRadius: 8, backgroundColor: "#F0F4F8" },
  monthYear: { fontSize: 14, fontWeight: "800", color: "#1A2332" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  dayHead: { flex: 1, alignItems: "center" },
  dayHeadTxt: { fontSize: 10, color: "#78909C", fontWeight: "700" },
  gridWrap: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  cellInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  dayTxt: {
    fontSize: 13,
    color: "#37474F",
    lineHeight: 30,
    textAlign: "center",
  },
  dayCellSelected: { backgroundColor: "#1E88E5" },
  dayCellToday: { borderWidth: 1.5, borderColor: "#1A73E8" },

  // Month + Year tile grid (4 columns × 3 rows = 12 tiles)
  tileGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  tile: {
    width: "25%",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSelected: { backgroundColor: "#1E88E5", borderRadius: 12 },
  tileToday: { borderWidth: 1, borderColor: "#1A73E8", borderRadius: 12 },
  tileTxt: { fontSize: 13, color: "#37474F", fontWeight: "600" },

  // Modal backdrop + centering
  // The extreme zIndex/elevation values ensure the modal renders on top of
  // Expo Web's `position: fixed` chrome (nav bars, sticky headers) and on
  // Android where TextInput/Native components can otherwise appear above.
  backdrop: {
    flex: 1,
    backgroundColor:
      Platform.OS === "web" ? "transparent" : "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
    elevation: 24,
  },
  modalCenter: {
    alignSelf: "center",
    zIndex: 10000,
    elevation: 25,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F4F8",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  footerBtnTxt: { fontSize: 12, fontWeight: "600", color: "#78909C" },
});
