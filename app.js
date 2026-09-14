(function () {
  "use strict";

  var STORAGE_KEY = "simpleTrackerData";
  var MAX_ACTIVITIES = 10;
  var DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // ---------------- storage ----------------
  function defaultState() {
    return {
      activities: [
        { id: uid(), name: "Play guitar", points: 3 },
        { id: uid(), name: "Sleep before 10 PM", points: 2 },
        { id: uid(), name: "Adhoc", points: 1 }
      ],
      archivedActivities: [],
      entries: {}, // "YYYY-MM-DD" -> { activityId: { status: "done"|"missed", comment: "", points: number } }
      redemptions: {} // "YYYY-MM-DD" -> { points: number, comment: "" }
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.activities) || typeof parsed.entries !== "object") {
        return defaultState();
      }
      if (!Array.isArray(parsed.archivedActivities)) parsed.archivedActivities = [];
      if (!parsed.redemptions || typeof parsed.redemptions !== "object") parsed.redemptions = {};
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  var state = loadState();

  // ---------------- date helpers ----------------
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameDate(a, b) { return fmtDate(a) === fmtDate(b); }

  function startOfWeek(d) {
    var x = startOfDay(d);
    x = addDays(x, -x.getDay()); // Sunday
    return x;
  }

  function weekLabel(weekStart) {
    var today = startOfDay(new Date());
    var thisWeekStart = startOfWeek(today);
    if (sameDate(weekStart, thisWeekStart)) return "This week";
    var weekEnd = addDays(weekStart, 6);
    var opts = { month: "short", day: "numeric" };
    return weekStart.toLocaleDateString(undefined, opts) + " – " + weekEnd.toLocaleDateString(undefined, opts);
  }

  function monthLabel(year, month) {
    var today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) return "This month";
    return MONTH_NAMES[month] + " " + year;
  }

  function dayLabel(d) {
    var today = startOfDay(new Date());
    if (sameDate(d, today)) return "Today";
    if (sameDate(d, addDays(today, -1))) return "Yesterday";
    if (sameDate(d, addDays(today, 1))) return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  function formatTime12(t) {
    if (!t) return "";
    var parts = t.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + ampm;
  }

  function formatTimeRange(start, end) {
    if (start && end) return formatTime12(start) + " – " + formatTime12(end);
    if (start) return "from " + formatTime12(start);
    if (end) return "until " + formatTime12(end);
    return "";
  }

  // ---------------- app state (ui) ----------------
  var ui = {
    view: "track",
    trackWeekStart: startOfWeek(new Date()),
    dashPeriod: "week",
    dashDate: startOfDay(new Date()),
    dashWeekStart: startOfWeek(new Date()),
    dashYear: new Date().getFullYear(),
    dashMonth: new Date().getMonth(),
    modalTarget: null, // { activityId, dateStr }
    editingActivityId: null,
    redeemTarget: null // dateStr
  };

  // ---------------- activity lookup ----------------
  function activityMeta(id) {
    for (var i = 0; i < state.activities.length; i++) {
      if (state.activities[i].id === id) {
        var a = state.activities[i];
        return { id: a.id, name: a.name, points: Number(a.points) || 0, archived: false };
      }
    }
    for (var j = 0; j < state.archivedActivities.length; j++) {
      if (state.archivedActivities[j].id === id) {
        var b = state.archivedActivities[j];
        return { id: b.id, name: b.name, points: Number(b.points) || 0, archived: true };
      }
    }
    return { id: id, name: "Deleted activity", points: 0, archived: true, missing: true };
  }

  function pointsForActivity(id) {
    return activityMeta(id).points;
  }

  // ---------------- entry helpers ----------------
  function getEntry(dateStr, activityId) {
    var day = state.entries[dateStr];
    if (!day) return null;
    return day[activityId] || null;
  }

  function setEntry(dateStr, activityId, entry) {
    if (!state.entries[dateStr]) state.entries[dateStr] = {};
    if (entry === null) {
      delete state.entries[dateStr][activityId];
      if (Object.keys(state.entries[dateStr]).length === 0) delete state.entries[dateStr];
    } else {
      state.entries[dateStr][activityId] = entry;
    }
    saveState();
  }

  function pointsForEntry(entry, activityId) {
    if (!entry || entry.status !== "done") return 0;
    if (typeof entry.points === "number") return entry.points;
    return pointsForActivity(activityId); // legacy entries saved before point-snapshots existed
  }

  function dayEarnedPoints(dateStr) {
    var day = state.entries[dateStr];
    if (!day) return 0;
    var total = 0;
    Object.keys(day).forEach(function (actId) {
      total += pointsForEntry(day[actId], actId);
    });
    return total;
  }

  function getRedemption(dateStr) {
    return state.redemptions[dateStr] || null;
  }

  function setRedemption(dateStr, entry) {
    if (entry === null) {
      delete state.redemptions[dateStr];
    } else {
      state.redemptions[dateStr] = entry;
    }
    saveState();
  }

  function dayRedeemedPoints(dateStr) {
    var r = state.redemptions[dateStr];
    return r ? Number(r.points) || 0 : 0;
  }

  function dayNetPoints(dateStr) {
    return dayEarnedPoints(dateStr) - dayRedeemedPoints(dateStr);
  }

  function allDatesWithData() {
    var dates = {};
    Object.keys(state.entries).forEach(function (d) { dates[d] = true; });
    Object.keys(state.redemptions).forEach(function (d) { dates[d] = true; });
    return Object.keys(dates);
  }

  // running cumulative total through (and including) dateStr, like a bank balance
  function accumulatedAsOf(dateStr) {
    var total = 0;
    allDatesWithData().forEach(function (d) {
      if (d <= dateStr) total += dayNetPoints(d);
    });
    return total;
  }

  // ---------------- rendering: track view ----------------
  function renderTrack() {
    document.getElementById("weekLabel").textContent = weekLabel(ui.trackWeekStart);
    var table = document.getElementById("trackGrid");
    var emptyState = document.getElementById("emptyStateTrack");
    table.innerHTML = "";

    if (state.activities.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");

    var today = startOfDay(new Date());
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(ui.trackWeekStart, i));

    // header row
    var thead = document.createElement("tr");
    var thBlank = document.createElement("th");
    thead.appendChild(thBlank);
    days.forEach(function (d) {
      var th = document.createElement("th");
      var isToday = sameDate(d, today);
      if (isToday) th.classList.add("today-col");
      th.innerHTML = '<span class="day-name">' + DAY_NAMES[d.getDay()] + '</span>' +
        '<span class="day-num' + (isToday ? " today-badge" : "") + '">' + d.getDate() + '</span>';
      thead.appendChild(th);
    });
    table.appendChild(thead);

    // activity rows
    state.activities.forEach(function (activity) {
      var tr = document.createElement("tr");
      var nameTd = document.createElement("td");
      nameTd.className = "activity-name-cell";
      var timeRange = formatTimeRange(activity.startTime, activity.endTime);
      nameTd.innerHTML = escapeHtml(activity.name) + (timeRange ? '<span class="activity-time-label">' + escapeHtml(timeRange) + '</span>' : "");
      tr.appendChild(nameTd);

      days.forEach(function (d) {
        var dateStr = fmtDate(d);
        var isToday = sameDate(d, today);
        var td = document.createElement("td");
        td.className = "day-cell" + (isToday ? " today-col" : "");
        var entry = getEntry(dateStr, activity.id);
        if (entry) {
          td.classList.add(entry.status);
          if (entry.status === "done") {
            td.innerHTML = '<span class="check">✓</span>';
          } else {
            td.innerHTML = '<span class="check">✕</span>';
          }
        }
        td.addEventListener("click", function () {
          openCellModal(activity.id, dateStr, d);
        });
        tr.appendChild(td);
      });

      table.appendChild(tr);
    });

    // redeemed summary row (right after the activities)
    var redeemTr = document.createElement("tr");
    redeemTr.className = "redeem-row";
    var redeemLabelTd = document.createElement("td");
    redeemLabelTd.className = "redeem-row-label";
    redeemLabelTd.textContent = "Redeemed";
    redeemTr.appendChild(redeemLabelTd);
    days.forEach(function (d) {
      var dateStr = fmtDate(d);
      var isToday = sameDate(d, today);
      var td = document.createElement("td");
      td.className = "day-cell" + (isToday ? " today-col" : "");
      var r = getRedemption(dateStr);
      if (r && r.points) {
        td.classList.add("has-redeem");
        td.innerHTML = '<span>-' + r.points + '</span>';
      } else {
        td.innerHTML = '<span class="dim">–</span>';
      }
      td.addEventListener("click", function () {
        openRedeemModal(dateStr, d);
      });
      redeemTr.appendChild(td);
    });
    table.appendChild(redeemTr);

    // earned summary row
    var pointsTr = document.createElement("tr");
    pointsTr.className = "points-row";
    var pointsLabelTd = document.createElement("td");
    pointsLabelTd.className = "points-row-label";
    pointsLabelTd.textContent = "Earned";
    pointsTr.appendChild(pointsLabelTd);
    days.forEach(function (d) {
      var dateStr = fmtDate(d);
      var isToday = sameDate(d, today);
      var td = document.createElement("td");
      td.className = "day-cell" + (isToday ? " today-col" : "");
      td.textContent = dayEarnedPoints(dateStr);
      pointsTr.appendChild(td);
    });
    table.appendChild(pointsTr);

    // net summary row (running balance, as of that day; future days show "-")
    var totalTr = document.createElement("tr");
    totalTr.className = "total-row";
    var totalLabelTd = document.createElement("td");
    totalLabelTd.className = "total-row-label";
    totalLabelTd.textContent = "Net";
    totalTr.appendChild(totalLabelTd);
    days.forEach(function (d) {
      var dateStr = fmtDate(d);
      var isToday = sameDate(d, today);
      var td = document.createElement("td");
      td.className = "day-cell" + (isToday ? " today-col" : "");
      td.textContent = d > today ? "–" : accumulatedAsOf(dateStr);
      totalTr.appendChild(td);
    });
    table.appendChild(totalTr);
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------------- cell modal ----------------
  function openCellModal(activityId, dateStr, dateObj) {
    var meta = activityMeta(activityId);
    ui.modalTarget = { activityId: activityId, dateStr: dateStr };

    document.getElementById("modalActivityName").textContent = meta.name;
    document.getElementById("modalDateLabel").textContent = dateObj.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

    var entry = getEntry(dateStr, activityId);
    document.getElementById("commentInput").value = entry && entry.comment ? entry.comment : "";
    document.getElementById("commentSection").classList.add("hidden");
    document.getElementById("clearCellBtn").classList.toggle("hidden", !entry);

    document.getElementById("modalOverlay").classList.remove("hidden");
  }

  function closeCellModal() {
    document.getElementById("modalOverlay").classList.add("hidden");
    ui.modalTarget = null;
  }

  function handleMarkMissed() {
    if (!ui.modalTarget) return;
    setEntry(ui.modalTarget.dateStr, ui.modalTarget.activityId, { status: "missed" });
    closeCellModal();
    renderAll();
  }

  function handleShowCommentInput() {
    document.getElementById("commentSection").classList.remove("hidden");
    document.getElementById("commentInput").focus();
  }

  function handleSaveDone() {
    if (!ui.modalTarget) return;
    var comment = document.getElementById("commentInput").value.trim();
    var points = pointsForActivity(ui.modalTarget.activityId);
    setEntry(ui.modalTarget.dateStr, ui.modalTarget.activityId, { status: "done", comment: comment, points: points });
    closeCellModal();
    renderAll();
  }

  function handleClearCell() {
    if (!ui.modalTarget) return;
    setEntry(ui.modalTarget.dateStr, ui.modalTarget.activityId, null);
    closeCellModal();
    renderAll();
  }

  // ---------------- redeem modal ----------------
  function openRedeemModal(dateStr, dateObj) {
    ui.redeemTarget = dateStr;
    var existing = getRedemption(dateStr);
    document.getElementById("redeemDateLabel").textContent = dateObj.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    var available = accumulatedAsOf(dateStr) + (existing ? existing.points : 0);
    document.getElementById("redeemAvailableHint").textContent = "You have " + available + " pts accumulated so far.";
    document.getElementById("redeemPointsInput").value = existing ? existing.points : "";
    document.getElementById("redeemCommentInput").value = existing && existing.comment ? existing.comment : "";
    document.getElementById("clearRedeemBtn").classList.toggle("hidden", !existing);
    document.getElementById("redeemModalOverlay").classList.remove("hidden");
  }

  function closeRedeemModal() {
    document.getElementById("redeemModalOverlay").classList.add("hidden");
    ui.redeemTarget = null;
  }

  function handleSaveRedeem() {
    if (!ui.redeemTarget) return;
    var points = Number(document.getElementById("redeemPointsInput").value);
    if (isNaN(points) || points <= 0) {
      showMessage("Points needed", "Enter how many points to redeem (more than 0).");
      return;
    }
    var comment = document.getElementById("redeemCommentInput").value.trim();
    setRedemption(ui.redeemTarget, { points: points, comment: comment });
    closeRedeemModal();
    renderAll();
  }

  function handleClearRedeem() {
    if (!ui.redeemTarget) return;
    setRedemption(ui.redeemTarget, null);
    closeRedeemModal();
    renderAll();
  }

  // ---------------- dashboard ----------------
  function currentDashRange() {
    if (ui.dashPeriod === "day") {
      return { start: ui.dashDate, end: ui.dashDate, label: dayLabel(ui.dashDate) };
    } else if (ui.dashPeriod === "week") {
      var start = ui.dashWeekStart;
      var end = addDays(start, 6);
      return { start: start, end: end, label: weekLabel(start) };
    } else {
      var start2 = new Date(ui.dashYear, ui.dashMonth, 1);
      var end2 = new Date(ui.dashYear, ui.dashMonth + 1, 0);
      return { start: start2, end: end2, label: monthLabel(ui.dashYear, ui.dashMonth) };
    }
  }

  function periodStatLabel() {
    if (ui.dashPeriod === "day") return "earned this day";
    if (ui.dashPeriod === "week") return "earned this week";
    return "earned this month";
  }

  function periodRedeemedLabel() {
    if (ui.dashPeriod === "day") return "redeemed this day";
    if (ui.dashPeriod === "week") return "redeemed this week";
    return "redeemed this month";
  }

  function renderDashboard() {
    var range = currentDashRange();
    document.getElementById("dashPeriodLabel").textContent = range.label;
    document.getElementById("statPeriodLabel").textContent = periodStatLabel();
    document.getElementById("statRedeemedLabel").textContent = periodRedeemedLabel();
    document.getElementById("toggleDay").classList.toggle("active", ui.dashPeriod === "day");
    document.getElementById("toggleWeek").classList.toggle("active", ui.dashPeriod === "week");
    document.getElementById("toggleMonth").classList.toggle("active", ui.dashPeriod === "month");

    var periodTotal = 0;
    var periodRedeemed = 0;
    var perActivity = {};
    var idOrder = [];
    state.activities.forEach(function (a) {
      perActivity[a.id] = { done: 0, missed: 0, points: 0 };
      idOrder.push(a.id);
    });

    var cursor = new Date(range.start);
    while (cursor <= range.end) {
      var dateStr = fmtDate(cursor);
      var day = state.entries[dateStr];
      if (day) {
        Object.keys(day).forEach(function (actId) {
          if (!perActivity[actId]) {
            perActivity[actId] = { done: 0, missed: 0, points: 0 };
            idOrder.push(actId);
          }
          var e = day[actId];
          if (e.status === "done") {
            perActivity[actId].done++;
            var pts = pointsForEntry(e, actId);
            perActivity[actId].points += pts;
            periodTotal += pts;
          } else if (e.status === "missed") {
            perActivity[actId].missed++;
          }
        });
      }
      periodRedeemed += dayRedeemedPoints(dateStr);
      cursor = addDays(cursor, 1);
    }

    document.getElementById("statPeriodPoints").textContent = periodTotal;
    document.getElementById("statRedeemedPoints").textContent = periodRedeemed;
    document.getElementById("statTotalPoints").textContent = accumulatedAsOf(fmtDate(range.end));

    var listEl = document.getElementById("activityBreakdown");
    listEl.innerHTML = "";

    if (idOrder.length === 0) {
      listEl.innerHTML = '<p class="hint" style="text-align:center">Add activities in Settings to see stats here.</p>';
    } else {
      var maxPoints = 1;
      idOrder.forEach(function (id) {
        if (perActivity[id].points > maxPoints) maxPoints = perActivity[id].points;
      });

      idOrder.forEach(function (id) {
        var meta = activityMeta(id);
        var stat = perActivity[id];
        var item = document.createElement("div");
        item.className = "breakdown-item" + (meta.archived ? " archived" : "");
        var pct = Math.round((stat.points / maxPoints) * 100);
        var subText;
        if (ui.dashPeriod === "day") {
          var dayEntry = getEntry(fmtDate(range.start), id);
          var statusWord = stat.done ? "Done" : (stat.missed ? "Missed" : "Not tracked");
          var commentPart = dayEntry && dayEntry.comment ? " · " + escapeHtml(dayEntry.comment) : "";
          subText = statusWord + commentPart + " · " + meta.points + " pts each";
        } else {
          subText = stat.done + " done · " + stat.missed + " missed · " + meta.points + " pts each";
        }
        item.innerHTML =
          '<div class="breakdown-top"><span>' + escapeHtml(meta.name) + (meta.archived ? '<span class="archived-badge">deleted</span>' : '') + '</span><span class="breakdown-points">' + stat.points + ' pts</span></div>' +
          '<div class="breakdown-sub">' + subText + '</div>' +
          '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
        listEl.appendChild(item);
      });
    }

    // show the day's redemption (with its comment) in the activity breakdown, daily view only
    if (ui.dashPeriod === "day") {
      var dayDateStr = fmtDate(range.start);
      var redemption = getRedemption(dayDateStr);
      if (redemption) {
        var rItem = document.createElement("div");
        rItem.className = "breakdown-item redeemed";
        rItem.innerHTML =
          '<div class="breakdown-top"><span>Redeemed</span><span class="breakdown-points">-' + redemption.points + ' pts</span></div>' +
          (redemption.comment ? '<div class="breakdown-sub">' + escapeHtml(redemption.comment) + '</div>' : '');
        listEl.appendChild(rItem);
      }
    }

    // by-day breakdown (hidden for the daily period itself)
    var dayWrap = document.getElementById("dayBreakdownWrap");
    if (ui.dashPeriod === "day") {
      dayWrap.classList.add("hidden");
    } else {
      dayWrap.classList.remove("hidden");
      renderDayBreakdown(range);
    }
  }

  function renderDayBreakdown(range) {
    var listEl = document.getElementById("dayBreakdown");
    listEl.innerHTML = "";
    var today = startOfDay(new Date());
    var cursor = new Date(range.start);
    while (cursor <= range.end) {
      (function (d) {
        var dateStr = fmtDate(d);
        var pts = dayNetPoints(dateStr);
        var redeemed = dayRedeemedPoints(dateStr);
        var isToday = sameDate(d, today);
        var row = document.createElement("div");
        row.className = "day-breakdown-item" + (isToday ? " today" : "");
        row.innerHTML =
          '<div class="day-breakdown-date">' + WEEKDAY_NAMES[d.getDay()] +
          '<span class="sub">' + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          (redeemed ? ' · -' + redeemed + ' redeemed' : '') + '</span></div>' +
          '<div class="day-breakdown-points' + (pts === 0 ? " zero" : "") + '">' + pts + ' pts</div>';
        row.addEventListener("click", function () {
          ui.dashPeriod = "day";
          ui.dashDate = startOfDay(d);
          renderDashboard();
        });
        listEl.appendChild(row);
      })(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  // ---------------- confirm / message modal (replaces native confirm/alert, which some browsers/embeds block) ----------------
  var confirmCallback = null;

  function showConfirm(title, message, confirmLabel, onConfirm) {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalMessage").textContent = message;
    document.getElementById("confirmModalConfirmBtn").textContent = confirmLabel || "Yes";
    document.getElementById("confirmModalConfirmBtn").className = "btn-danger btn-block";
    document.getElementById("confirmModalCancelBtn").classList.remove("hidden");
    confirmCallback = onConfirm;
    document.getElementById("confirmModalOverlay").classList.remove("hidden");
  }

  function showMessage(title, message) {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalMessage").textContent = message;
    document.getElementById("confirmModalConfirmBtn").textContent = "OK";
    document.getElementById("confirmModalConfirmBtn").className = "btn-primary btn-block";
    document.getElementById("confirmModalCancelBtn").classList.add("hidden");
    confirmCallback = null;
    document.getElementById("confirmModalOverlay").classList.remove("hidden");
  }

  function closeConfirmModal() {
    document.getElementById("confirmModalOverlay").classList.add("hidden");
    confirmCallback = null;
  }

  // ---------------- settings ----------------
  function renderSettings() {
    document.getElementById("activityCount").textContent = state.activities.length + "/" + MAX_ACTIVITIES;
    var list = document.getElementById("activityList");
    list.innerHTML = "";
    state.activities.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "activity-row";
      var timeRange = formatTimeRange(a.startTime, a.endTime);
      row.innerHTML =
        '<div><div class="activity-row-name">' + escapeHtml(a.name) + '</div>' +
        '<div class="activity-row-points">' + a.points + ' points when done' + (timeRange ? ' · ' + escapeHtml(timeRange) : '') + '</div></div>' +
        '<div class="activity-row-arrow">›</div>';
      row.addEventListener("click", function () { openActivityModal(a.id); });
      list.appendChild(row);
    });
    document.getElementById("addActivityBtn").disabled = state.activities.length >= MAX_ACTIVITIES;
    document.getElementById("addActivityBtn").style.opacity = state.activities.length >= MAX_ACTIVITIES ? 0.5 : 1;

    renderArchivedActivities();
  }

  function renderArchivedActivities() {
    var existing = document.getElementById("archivedSection");
    if (existing) existing.remove();
    if (state.archivedActivities.length === 0) return;

    var section = document.createElement("div");
    section.id = "archivedSection";
    var heading = document.createElement("h2");
    heading.className = "section-title";
    heading.style.marginTop = "24px";
    heading.textContent = "Deleted activities (history kept)";
    section.appendChild(heading);

    var hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Removed from tracking, but their past points still count in your Dashboard totals.";
    section.appendChild(hint);

    var list = document.createElement("div");
    list.className = "activity-list";
    state.archivedActivities.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "activity-row archived";
      row.innerHTML =
        '<div><div class="activity-row-name">' + escapeHtml(a.name) + '</div>' +
        '<div class="activity-row-points">' + a.points + ' points when done</div></div>';
      list.appendChild(row);
    });
    section.appendChild(list);

    document.getElementById("addActivityBtn").insertAdjacentElement("afterend", section);
  }

  function openActivityModal(activityId) {
    ui.editingActivityId = activityId || null;
    var titleEl = document.getElementById("activityModalTitle");
    var deleteBtn = document.getElementById("deleteActivityBtn");
    if (activityId) {
      var a = state.activities.filter(function (x) { return x.id === activityId; })[0];
      titleEl.textContent = "Edit activity";
      document.getElementById("activityNameInput").value = a.name;
      document.getElementById("activityPointsInput").value = a.points;
      document.getElementById("activityStartInput").value = a.startTime || "";
      document.getElementById("activityEndInput").value = a.endTime || "";
      deleteBtn.classList.remove("hidden");
    } else {
      titleEl.textContent = "New activity";
      document.getElementById("activityNameInput").value = "";
      document.getElementById("activityPointsInput").value = "1";
      document.getElementById("activityStartInput").value = "";
      document.getElementById("activityEndInput").value = "";
      deleteBtn.classList.add("hidden");
    }
    document.getElementById("activityModalOverlay").classList.remove("hidden");
  }

  function closeActivityModal() {
    document.getElementById("activityModalOverlay").classList.add("hidden");
    ui.editingActivityId = null;
  }

  function handleSaveActivity() {
    var name = document.getElementById("activityNameInput").value.trim();
    var points = Number(document.getElementById("activityPointsInput").value);
    var startTime = document.getElementById("activityStartInput").value || "";
    var endTime = document.getElementById("activityEndInput").value || "";
    if (!name) { showMessage("Name required", "Please enter a name for the activity."); return; }
    if (isNaN(points) || points < 0) points = 0;

    if (ui.editingActivityId) {
      var a = state.activities.filter(function (x) { return x.id === ui.editingActivityId; })[0];
      if (a) { a.name = name; a.points = points; a.startTime = startTime; a.endTime = endTime; }
    } else {
      if (state.activities.length >= MAX_ACTIVITIES) { showMessage("Limit reached", "You can track up to " + MAX_ACTIVITIES + " activities."); return; }
      state.activities.push({ id: uid(), name: name, points: points, startTime: startTime, endTime: endTime });
    }
    saveState();
    closeActivityModal();
    renderAll();
  }

  function handleDeleteActivity() {
    if (!ui.editingActivityId) return;
    var id = ui.editingActivityId;
    showConfirm(
      "Delete activity?",
      "It will no longer appear in Track, but points already earned will stay in your Dashboard totals.",
      "Delete",
      function () {
        var idx = -1;
        for (var i = 0; i < state.activities.length; i++) {
          if (state.activities[i].id === id) { idx = i; break; }
        }
        if (idx !== -1) {
          var removed = state.activities.splice(idx, 1)[0];
          state.archivedActivities.push({ id: removed.id, name: removed.name, points: removed.points, deletedAt: fmtDate(new Date()) });
        }
        saveState();
        closeActivityModal();
        renderAll();
      }
    );
  }

  // ---------------- export / import / reset ----------------
  function handleExport() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "simple-tracker-backup-" + fmtDate(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.activities) || typeof parsed.entries !== "object") {
          throw new Error("bad shape");
        }
        if (!Array.isArray(parsed.archivedActivities)) parsed.archivedActivities = [];
        if (!parsed.redemptions || typeof parsed.redemptions !== "object") parsed.redemptions = {};
        state = parsed;
        saveState();
        renderAll();
        showMessage("Import complete", "Backup imported.");
      } catch (e) {
        showMessage("Import failed", "That file doesn't look like a valid Simple Daily Task Tracker backup.");
      }
    };
    reader.readAsText(file);
  }

  function handleReset() {
    showConfirm(
      "Reset all data?",
      "This will erase all activities and tracked history on this device. This cannot be undone.",
      "Reset",
      function () {
        state = defaultState();
        saveState();
        renderAll();
      }
    );
  }

  // ---------------- view switching ----------------
  function switchView(view) {
    ui.view = view;
    ["track", "dashboard", "settings"].forEach(function (v) {
      document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
    });
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-view") === view);
    });
    renderAll();
  }

  function renderAll() {
    if (ui.view === "track") renderTrack();
    else if (ui.view === "dashboard") renderDashboard();
    else if (ui.view === "settings") renderSettings();
  }

  // ---------------- event wiring ----------------
  document.getElementById("prevWeek").addEventListener("click", function () {
    ui.trackWeekStart = addDays(ui.trackWeekStart, -7);
    renderTrack();
  });
  document.getElementById("nextWeek").addEventListener("click", function () {
    ui.trackWeekStart = addDays(ui.trackWeekStart, 7);
    renderTrack();
  });

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { switchView(btn.getAttribute("data-view")); });
  });

  document.getElementById("goSetupBtn").addEventListener("click", function () { switchView("settings"); });

  document.getElementById("modalDoneBtn").addEventListener("click", handleShowCommentInput);
  document.getElementById("modalMissedBtn").addEventListener("click", handleMarkMissed);
  document.getElementById("saveCommentBtn").addEventListener("click", handleSaveDone);
  document.getElementById("clearCellBtn").addEventListener("click", handleClearCell);
  document.getElementById("modalCancelBtn").addEventListener("click", closeCellModal);
  document.getElementById("modalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeCellModal();
  });
  document.getElementById("commentInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") handleSaveDone();
  });

  document.getElementById("toggleDay").addEventListener("click", function () {
    ui.dashPeriod = "day"; renderDashboard();
  });
  document.getElementById("toggleWeek").addEventListener("click", function () {
    ui.dashPeriod = "week"; renderDashboard();
  });
  document.getElementById("toggleMonth").addEventListener("click", function () {
    ui.dashPeriod = "month"; renderDashboard();
  });
  document.getElementById("prevPeriodDash").addEventListener("click", function () {
    if (ui.dashPeriod === "day") {
      ui.dashDate = addDays(ui.dashDate, -1);
    } else if (ui.dashPeriod === "week") {
      ui.dashWeekStart = addDays(ui.dashWeekStart, -7);
    } else {
      ui.dashMonth--;
      if (ui.dashMonth < 0) { ui.dashMonth = 11; ui.dashYear--; }
    }
    renderDashboard();
  });
  document.getElementById("nextPeriodDash").addEventListener("click", function () {
    if (ui.dashPeriod === "day") {
      ui.dashDate = addDays(ui.dashDate, 1);
    } else if (ui.dashPeriod === "week") {
      ui.dashWeekStart = addDays(ui.dashWeekStart, 7);
    } else {
      ui.dashMonth++;
      if (ui.dashMonth > 11) { ui.dashMonth = 0; ui.dashYear++; }
    }
    renderDashboard();
  });

  document.getElementById("addActivityBtn").addEventListener("click", function () { openActivityModal(null); });
  document.getElementById("saveActivityBtn").addEventListener("click", handleSaveActivity);
  document.getElementById("deleteActivityBtn").addEventListener("click", handleDeleteActivity);
  document.getElementById("activityModalCancelBtn").addEventListener("click", closeActivityModal);
  document.getElementById("activityModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeActivityModal();
  });

  document.getElementById("exportBtn").addEventListener("click", handleExport);
  document.getElementById("importInput").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) handleImport(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("resetBtn").addEventListener("click", handleReset);

  document.getElementById("saveRedeemBtn").addEventListener("click", handleSaveRedeem);
  document.getElementById("clearRedeemBtn").addEventListener("click", handleClearRedeem);
  document.getElementById("redeemModalCancelBtn").addEventListener("click", closeRedeemModal);
  document.getElementById("redeemModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeRedeemModal();
  });

  document.getElementById("confirmModalConfirmBtn").addEventListener("click", function () {
    var cb = confirmCallback;
    closeConfirmModal();
    if (cb) cb();
  });
  document.getElementById("confirmModalCancelBtn").addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeConfirmModal();
  });

  // ---------------- init ----------------
  renderAll();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
