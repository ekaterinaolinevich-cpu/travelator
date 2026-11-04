/* ============================================================
   Травелатор — вся поездка в одном месте.
   Ванильный JS, без сборки и без зависимостей.
   ============================================================ */

(() => {
  'use strict';

  /* ── утилиты ─────────────────────────────────────────── */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const haptic = (style = 'light') => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {}
  };

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const DOW_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  const pad2 = (n) => String(n).padStart(2, '0');

  /** 'YYYY-MM-DD' → Date на полдень, чтобы не ловить проблемы с часовыми поясами */
  function parseDay(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function ymdOf(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayYMD() {
    return ymdOf(new Date());
  }

  function addDays(ymd, n) {
    const d = parseDay(ymd);
    d.setDate(d.getDate() + n);
    return ymdOf(d);
  }

  function daysUntil(ymd) {
    const a = parseDay(todayYMD()).getTime();
    const b = parseDay(ymd).getTime();
    return Math.round((b - a) / 86400000);
  }

  function dayMonth(ymd) {
    const d = parseDay(ymd);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  function dayMonthFull(ymd) {
    const d = parseDay(ymd);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function dow(ymd) {
    return DOW[parseDay(ymd).getDay()];
  }

  function dowFull(ymd) {
    return DOW_FULL[parseDay(ymd).getDay()];
  }

  function rangeShort(a, b) {
    const da = parseDay(a);
    const db = parseDay(b);
    if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS_SHORT[da.getMonth()]}`;
    return `${da.getDate()} ${MONTHS_SHORT[da.getMonth()]} – ${db.getDate()} ${MONTHS_SHORT[db.getMonth()]}`;
  }

  function rangeFull(a, b) {
    const da = parseDay(a);
    const db = parseDay(b);
    if (da.getMonth() === db.getMonth()) {
      return `${da.getDate()}–${db.getDate()} ${MONTHS[da.getMonth()]} ${db.getFullYear()}`;
    }
    return `${da.getDate()} ${MONTHS[da.getMonth()]} – ${db.getDate()} ${MONTHS[db.getMonth()]} ${db.getFullYear()}`;
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  const nf = new Intl.NumberFormat('ru-RU');
  const money = (n, withSign = true) => `${nf.format(Math.round(n))}${withSign ? '\u00A0₽' : ''}`;
  const num = (n) => nf.format(Math.round(n));

  /** местное время в точке назначения */
  function localTime(tz) {
    try {
      return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date());
    } catch {
      return '--:--';
    }
  }

  /** разница в часах между поясом поездки и домашним (Москва) */
  function tzDiff(tz, base = 'Europe/Moscow') {
    try {
      const parts = (zone) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: zone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(new Date());
      const toMs = (zone) => {
        const p = {};
        parts(zone).forEach((x) => { p[x.type] = x.value; });
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      };
      const diff = Math.round((toMs(tz) - toMs(base)) / 3600000);
      return diff;
    } catch {
      return 0;
    }
  }

  function tzDiffLabel(tz) {
    const d = tzDiff(tz);
    if (!d) return 'как в Москве';
    return `${d > 0 ? '+' : '−'}${Math.abs(d)} ч к Москве`;
  }

  /** «через 11 дн 4 ч» для ISO-строки локального времени */
  function untilText(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms)) return '';
    if (ms <= 0) return 'уже началось';
    const totalMin = Math.round(ms / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d > 0) return `через ${d} ${plural(d, ['день', 'дня', 'дней'])}${h ? ` ${h} ч` : ''}`;
    if (h > 0) return `через ${h} ч ${m ? `${m} мин` : ''}`.trim();
    return `через ${Math.max(1, m)} мин`;
  }

  function daysToText(n) {
    if (n === 0) return 'сегодня';
    if (n === 1) return 'завтра';
    if (n > 1) return `через ${n} ${plural(n, ['день', 'дня', 'дней'])}`;
    return `${Math.abs(n)} ${plural(Math.abs(n), ['день', 'дня', 'дней'])} назад`;
  }

  /* ── иконки ──────────────────────────────────────────── */

  const ICONS = {
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 3.9c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>',
    bed: '<path d="M3 19v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M3 19h18M3 19v1.5M21 19v1.5M7 9V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V9"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 9h14M9 13h.01M15 13h.01M8 17l-2 4M16 17l2 4"/>',
    shield: '<path d="M12 21.5S20 17.6 20 12V6.2L12 3 4 6.2V12c0 5.6 8 9.5 8 9.5Z"/><path d="m9 12 2 2 4-4"/>',
    passport: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
    ticket: '<path d="M3 9a3 3 0 0 1 0 6v1.5A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5V15a3 3 0 0 1 0-6V7.5A2.5 2.5 0 0 0 18.5 5h-13A2.5 2.5 0 0 0 3 7.5Z"/><path d="M14 5v2.5M14 16.5V19" stroke-dasharray="1.5 2.5"/>',
    car: '<path d="M5 16h14M6.2 16l-1.4-5.3A2 2 0 0 1 6.8 8h10.4a2 2 0 0 1 1.9 2.7L18 16M7 16v2.5M17 16v2.5M5.4 11.5h13.2"/>',
    doc: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 16.5h4.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',
    pin: '<path d="M20 10.2c0 5.8-8 11.8-8 11.8s-8-6-8-11.8a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    trash: '<path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.2 7l.9 13h9.8l.9-13M10 11v5.5M14 11v5.5"/>',
    wallet: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 17Z"/><path d="M3 8.5h17M16 13.5h2.5"/>',
    bag: '<path d="M5.5 8h13l-.9 12H6.4Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    sparkles: '<path d="m12 3.5 1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6-4.6-1.7 4.6-1.7Z"/><path d="m18.2 15.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    cloud: '<path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.7 1.4A2.8 2.8 0 0 0 7 18Z"/>',
    arrow: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    history: '<path d="M3.2 12a8.8 8.8 0 1 0 3-6.6M3 4v5h5"/><path d="M12 8v5l3.2 1.8"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16.2 7.8-2.9 6.5-6.5 2.9 2.9-6.5z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    map: '<path d="M9 4.5 3 7v13l6-2.5 6 2.5 6-2.5V4.5L15 7 9 4.5ZM9 4.5v13M15 7v13"/>',
    food: '<path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 10v11M17 3c-1.4 1.3-2 3-2 5.2 0 2 .8 3.2 2 3.6V21"/>',
    walk: '<circle cx="13" cy="4.5" r="2"/><path d="m12 8.5-3 3 .8 4.2L8 21M12 8.5l3.6 2.2 2.4 1M9.8 15.7 13.5 14l2.2 3.2L17 21"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  };

  function ico(name, cls = '') {
    return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.doc}</svg>`;
  }

  /* ── справочники ─────────────────────────────────────── */

  const TABS = ['overview', 'plan', 'docs', 'packing'];

  const KINDS = {
    flight: { label: 'Авиабилет', icon: 'plane', group: 'transport', tint: '' },
    train: { label: 'Ж/д билет', icon: 'train', group: 'transport', tint: 'tint-mint' },
    hotel: { label: 'Отель', icon: 'bed', group: 'stay', tint: 'tint-sand' },
    insurance: { label: 'Страховка', icon: 'shield', group: 'docs', tint: 'tint-mint' },
    visa: { label: 'Виза', icon: 'passport', group: 'docs', tint: 'tint-rose' },
    activity: { label: 'Билет', icon: 'ticket', group: 'activity', tint: 'tint-rose' },
    car: { label: 'Аренда авто', icon: 'car', group: 'transport', tint: 'tint-sand' },
    other: { label: 'Документ', icon: 'doc', group: 'docs', tint: '' },
  };

  const DOC_FILTERS = [
    { id: 'all', label: 'Всё' },
    { id: 'transport', label: 'Транспорт' },
    { id: 'stay', label: 'Жильё' },
    { id: 'docs', label: 'Страховка и виза' },
    { id: 'activity', label: 'Билеты и активности' },
  ];

  const CAT_COLORS = ['#ff6a4d', '#3fc7b4', '#f3bc5b', '#a99bf5', '#7fb2ff', '#f28ab2', '#8bd17c'];

  const PACK_GROUPS = [
    { id: 'docs', name: 'Документы и деньги', color: '#ff6a4d' },
    { id: 'clothes', name: 'Одежда', color: '#a99bf5' },
    { id: 'tech', name: 'Техника', color: '#7fb2ff' },
    { id: 'med', name: 'Аптечка', color: '#3fc7b4' },
    { id: 'road', name: 'В дорогу', color: '#f3bc5b' },
  ];

  const EVENT_ICONS = {
    flight: 'plane',
    train: 'train',
    hotel: 'bed',
    food: 'food',
    walk: 'walk',
    activity: 'ticket',
    move: 'car',
    rest: 'moon',
  };

  /* ── состояние ───────────────────────────────────────── */

  const DB_KEY = 'travelator.db.v2';

  const state = {
    db: null,
    tab: 'overview',
    planDay: null,
    docFilter: 'all',
    packTab: 'list',
    sheet: null,
    scroll: 0,
  };

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.trips) || !parsed.trips.length) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveDB() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(state.db));
    } catch {}
  }

  function seedDB() {
    const today = todayYMD();
    const start = addDays(today, 12);
    const end = addDays(start, 12);
    const ret = end;

    return {
      version: 2,
      activeTripId: 'tokyo',
      profile: { name: 'Катя', city: 'Москва' },
      trips: [
        {
          id: 'tokyo',
          city: 'Токио',
          title: 'Токио',
          country: 'Япония',
          glyph: '東京',
          tz: 'Asia/Tokyo',
          gradient: 'g-sunset',
          start,
          end,
          companions: ['Аня'],
          visaRequired: true,
          weather: { temp: 17, label: 'облачно', icon: 'cloud' },
          budget: {
            total: 260000,
            categories: [
              { id: 'flight', name: 'Перелёт', planned: 84000 },
              { id: 'stay', name: 'Жильё', planned: 96000 },
              { id: 'transport', name: 'Транспорт', planned: 18000 },
              { id: 'food', name: 'Еда', planned: 30000 },
              { id: 'fun', name: 'Активности', planned: 12000 },
              { id: 'shopping', name: 'Покупки', planned: 14000 },
              { id: 'misc', name: 'Прочее', planned: 6000 },
            ],
          },
          documents: [
            {
              id: 'fl-out',
              kind: 'flight',
              status: 'ok',
              title: 'Москва → Токио',
              date: start,
              time: '09:40',
              meta: {
                airline: 'Аэрофлот',
                number: 'SU 262',
                from: { code: 'SVO', city: 'Москва', terminal: 'C', time: '09:40', date: start },
                to: { code: 'NRT', city: 'Токио', terminal: 'T1', time: '10:25', date: addDays(start, 1) },
                duration: '9 ч 45 мин',
                seat: '32A',
                gate: 'C12',
                baggage: '2 × 23 кг',
                pnr: 'QK7R2M',
              },
            },
            {
              id: 'hotel',
              kind: 'hotel',
              status: 'ok',
              title: 'Shinjuku Granbell Hotel',
              date: addDays(start, 1),
              meta: {
                name: 'Shinjuku Granbell Hotel',
                address: '2-14-5 Kabukicho, Shinjuku, Tokyo',
                checkIn: addDays(start, 1),
                checkOut: addDays(end, -1),
                nights: 10,
                room: 'Double · завтрак',
                booking: 'HX-88213',
                phone: '+81 3-5155-2666',
              },
            },
            {
              id: 'fl-back',
              kind: 'flight',
              status: 'ok',
              title: 'Токио → Москва',
              date: ret,
              time: '12:10',
              meta: {
                airline: 'Аэрофлот',
                number: 'SU 261',
                from: { code: 'NRT', city: 'Токио', terminal: 'T1', time: '12:10', date: ret },
                to: { code: 'SVO', city: 'Москва', terminal: 'C', time: '17:35', date: ret },
                duration: '9 ч 25 мин',
                seat: '28C',
                gate: '—',
                baggage: '2 × 23 кг',
                pnr: 'QK7R2M',
              },
            },
            {
              id: 'jrpass',
              kind: 'train',
              status: 'ok',
              title: 'Japan Rail Pass, 7 дней',
              date: addDays(start, 1),
              time: '',
              meta: {
                operator: 'JR Group',
                from: 'Активация в Нарите',
                to: '7 дней подряд',
                code: 'JP-7-4471',
                note: 'Активировать на стойке JR в аэропорту, нужен паспорт',
              },
            },
            {
              id: 'ghibli',
              kind: 'activity',
              status: 'ok',
              title: 'Музей Гибли',
              date: addDays(start, 5),
              time: '14:00',
              meta: {
                name: 'Ghibli Museum',
                place: 'Ми́така, Токио',
                address: '1-1-83 Shimorenjaku, Mitaka',
                code: 'GH-0912',
                note: 'Вход строго по времени. Билет нужно распечатать.',
              },
            },
            {
              id: 'teamlab',
              kind: 'activity',
              status: 'ok',
              title: 'teamLab Planets',
              date: addDays(start, 8),
              time: '11:00',
              meta: {
                name: 'teamLab Planets TOKYO',
                place: 'Тоёсу, Токио',
                address: '6-1-16 Toyosu, Koto City',
                code: 'TL-4410',
                note: 'Босиком, есть шкафчики. Вода по колено в одном зале.',
              },
            },
            {
              id: 'ins',
              kind: 'insurance',
              status: 'ok',
              title: 'Страховка «Тинькофф»',
              date: addDays(today, -9),
              meta: {
                provider: 'Тинькофф Страхование',
                policy: '4471-889-002',
                validTo: addDays(end, 1),
                phone: '+7 800 555-77-88',
                sum: '€ 50 000',
              },
            },
            {
              id: 'visa',
              kind: 'visa',
              status: 'missing',
              title: 'Виза в Японию',
              date: addDays(start, -7),
              meta: {
                country: 'Япония',
                note: 'Подать документы до 9 ноября. Оформление 5–7 дней, без визы на рейс не пустят.',
              },
            },
          ],
          events: [
            { id: 'e1', day: start, time: '06:40', kind: 'move', title: 'Такси в Шереметьево', sub: 'Терминал C · встреча в 06:40', docId: '' },
            { id: 'e2', day: start, time: '09:40', kind: 'flight', title: 'Вылет SU 262', sub: 'SVO → NRT · 9 ч 45 мин', docId: 'fl-out' },
            { id: 'e3', day: addDays(start, 1), time: '10:25', kind: 'flight', title: 'Прилёт в Нариту', sub: 'Паспортный контроль, потом JR в город', docId: 'fl-back' },
            { id: 'e4', day: addDays(start, 1), time: '15:00', kind: 'hotel', title: 'Заезд в отель', sub: 'Shinjuku Granbell · Kabukicho', docId: 'hotel' },
            { id: 'e5', day: addDays(start, 1), time: '18:30', kind: 'food', title: 'Ужин в Омоидэ Ёкочо', sub: 'Переулки с лапшичными у станции Синдзюку' },
            { id: 'e6', day: addDays(start, 2), time: '10:00', kind: 'walk', title: 'Сибуя и Харадзюку', sub: 'Перекрёсток, Мэйдзи-дзингу, Такешита-стрит' },
            { id: 'e7', day: addDays(start, 2), time: '17:00', kind: 'activity', title: 'Shibuya Sky', sub: 'Смотровая на закат · билет лучше брать заранее' },
            { id: 'e8', day: addDays(start, 3), time: '08:00', kind: 'train', title: 'Никко на день', sub: 'Синкансэн до Уцуномии, потом JR · по JR Pass' },
            { id: 'e9', day: addDays(start, 3), time: '18:00', kind: 'rest', title: 'Онсэн вечером', sub: 'Тёсэн-дзи, открытая купель' },
            { id: 'e10', day: addDays(start, 4), time: '10:00', kind: 'walk', title: 'Асакуса и Сэнсо-дзи', sub: 'Старый Токио, Накамисэ-дори' },
            { id: 'e11', day: addDays(start, 4), time: '14:00', kind: 'activity', title: 'Tokyo Skytree', sub: '634 м · смотровая Tembo' },
            { id: 'e12', day: addDays(start, 5), time: '14:00', kind: 'activity', title: 'Музей Гибли', sub: 'Ми́така · вход по времени', docId: 'ghibli' },
            { id: 'e13', day: addDays(start, 6), time: '09:00', kind: 'train', title: 'Хаконэ', sub: 'Роппаку · озеро Аси · вид на Фудзи' },
            { id: 'e14', day: addDays(start, 7), time: '11:00', kind: 'train', title: 'Камакура', sub: 'Большой Будда, Эносима на закат' },
            { id: 'e15', day: addDays(start, 8), time: '11:00', kind: 'activity', title: 'teamLab Planets', sub: 'Тоёсу · босиком, без обуви', docId: 'teamlab' },
            { id: 'e16', day: addDays(start, 9), time: '10:00', kind: 'walk', title: 'Акихабара', sub: 'Ретро-игры, электроника, гигантские магазины' },
            { id: 'e17', day: addDays(start, 9), time: '19:00', kind: 'walk', title: 'Сибуя Кроссинг ночью', sub: 'Последние кадры и рамен на углу' },
            { id: 'e18', day: addDays(start, 11), time: '11:00', kind: 'hotel', title: 'Выезд из отеля', sub: 'Вещи оставить на стойке', docId: 'hotel' },
            { id: 'e19', day: addDays(start, 11), time: '19:00', kind: 'food', title: 'Прощальный ужин', sub: 'Идзакая в Синдзюку' },
            { id: 'e20', day: ret, time: '09:30', kind: 'flight', title: 'В аэропорт Нарита', sub: 'Narita Express · лучше за 3 часа', docId: 'fl-back' },
          ],
          packing: [
            { id: 'p1', group: 'docs', name: 'Паспорт', checked: true },
            { id: 'p2', group: 'docs', name: 'Копия паспорта', checked: true },
            { id: 'p3', group: 'docs', name: 'Виза', checked: false },
            { id: 'p4', group: 'docs', name: 'Страховка', checked: true },
            { id: 'p5', group: 'docs', name: 'Наличные йены', checked: true },
            { id: 'p6', group: 'docs', name: 'Карта UnionPay', checked: true },
            { id: 'p7', group: 'docs', name: 'Купики на первый день', checked: false },
            { id: 'p8', group: 'clothes', name: 'Куртка', checked: true },
            { id: 'p9', group: 'clothes', name: 'Джинсы', checked: true },
            { id: 'p10', group: 'clothes', name: 'Свитер', checked: true },
            { id: 'p11', group: 'clothes', name: 'Термобельё', checked: false },
            { id: 'p12', group: 'clothes', name: 'Кроссовки', checked: true },
            { id: 'p13', group: 'clothes', name: 'Носки', checked: false },
            { id: 'p14', group: 'clothes', name: 'Бельё', checked: true },
            { id: 'p15', group: 'clothes', name: 'Пижама', checked: false },
            { id: 'p16', group: 'tech', name: 'Телефон', checked: true },
            { id: 'p17', group: 'tech', name: 'Зарядка', checked: true },
            { id: 'p18', group: 'tech', name: 'Power bank', checked: true },
            { id: 'p19', group: 'tech', name: 'Адаптер Type A', checked: true },
            { id: 'p20', group: 'tech', name: 'Наушники', checked: false },
            { id: 'p21', group: 'med', name: 'Таблетки от головы', checked: false },
            { id: 'p22', group: 'med', name: 'Пластыри', checked: false },
            { id: 'p23', group: 'med', name: 'Мелатонин', checked: false },
            { id: 'p24', group: 'road', name: 'Подушка для шеи', checked: false },
            { id: 'p25', group: 'road', name: 'Книга', checked: false },
            { id: 'p26', group: 'road', name: 'Бутылка для воды', checked: false },
          ],
          expenses: [
            { id: 'x1', cat: 'flight', title: 'Авиабилеты SVO–NRT, туда-обратно', amount: 84000, date: addDays(today, -19) },
            { id: 'x2', cat: 'stay', title: 'Отель, предоплата 50%', amount: 48000, date: addDays(today, -16) },
            { id: 'x3', cat: 'transport', title: 'Japan Rail Pass', amount: 18000, date: addDays(today, -14) },
            { id: 'x4', cat: 'fun', title: 'Музей Гибли', amount: 1800, date: addDays(today, -11) },
            { id: 'x5', cat: 'misc', title: 'Страховка на 12 дней', amount: 4200, date: addDays(today, -9) },
          ],
        },
        {
          id: 'istanbul',
          city: 'Стамбул',
          title: 'Стамбул',
          country: 'Турция',
          glyph: 'İST',
          tz: 'Europe/Istanbul',
          gradient: 'g-sea',
          start: addDays(today, -45),
          end: addDays(today, -40),
          companions: ['Аня'],
          visaRequired: false,
          weather: { temp: 21, label: 'ясно', icon: 'sun' },
          budget: {
            total: 120000,
            categories: [
              { id: 'flight', name: 'Перелёт', planned: 42000 },
              { id: 'stay', name: 'Жильё', planned: 34000 },
              { id: 'transport', name: 'Транспорт', planned: 6000 },
              { id: 'food', name: 'Еда', planned: 22000 },
              { id: 'fun', name: 'Активности', planned: 10000 },
              { id: 'shopping', name: 'Покупки', planned: 6000 },
            ],
          },
          documents: [
            {
              id: 'ist-fl',
              kind: 'flight',
              status: 'ok',
              title: 'Москва → Стамбул',
              date: addDays(today, -45),
              time: '08:15',
              meta: {
                airline: 'Turkish Airlines',
                number: 'TK 414',
                from: { code: 'VKO', city: 'Москва', terminal: 'A', time: '08:15', date: addDays(today, -45) },
                to: { code: 'IST', city: 'Стамбул', terminal: 'I', time: '12:40', date: addDays(today, -45) },
                duration: '3 ч 25 мин',
                seat: '14F',
                gate: 'A7',
                baggage: '1 × 23 кг',
                pnr: 'TR9K4L',
              },
            },
            {
              id: 'ist-hotel',
              kind: 'hotel',
              status: 'ok',
              title: 'Nevi Hotel & Suites',
              date: addDays(today, -45),
              meta: {
                name: 'Nevi Hotel & Suites',
                address: 'Hocapaşa Sk. 12, Fatih, İstanbul',
                checkIn: addDays(today, -45),
                checkOut: addDays(today, -42),
                nights: 5,
                room: 'Deluxe',
                booking: 'NV-2210',
                phone: '+90 212 512 00 00',
              },
            },
            {
              id: 'ist-ins',
              kind: 'insurance',
              status: 'ok',
              title: 'Страховка на поездку',
              date: addDays(today, -50),
              meta: { provider: 'Сбербанк Страхование', policy: '77-102-33', validTo: addDays(today, -40), phone: '+7 800 555-55-50', sum: '€ 30 000' },
            },
          ],
          events: [
            { id: 'i1', day: addDays(today, -45), time: '08:15', kind: 'flight', title: 'Вылет TK 414', sub: 'VKO → IST', docId: 'ist-fl' },
            { id: 'i2', day: addDays(today, -45), time: '15:00', kind: 'hotel', title: 'Заезд в отель', sub: 'Фатих, 5 минут до Гранд-базара', docId: 'ist-hotel' },
            { id: 'i3', day: addDays(today, -44), time: '10:00', kind: 'walk', title: 'Айя-София и Голубая мечеть', sub: 'Султанахмет' },
            { id: 'i4', day: addDays(today, -43), time: '09:00', kind: 'walk', title: 'Гранд-базар', sub: 'Торг обязателен' },
            { id: 'i5', day: addDays(today, -42), time: '17:00', kind: 'food', title: 'Ужин на Галатском мосту', sub: 'Рыба и вид на закат' },
          ],
          packing: [
            { id: 'ip1', group: 'docs', name: 'Паспорт', checked: true },
            { id: 'ip2', group: 'docs', name: 'Страховка', checked: true },
            { id: 'ip3', group: 'clothes', name: 'Кроссовки', checked: true },
            { id: 'ip4', group: 'tech', name: 'Зарядка', checked: true },
            { id: 'ip5', group: 'tech', name: 'Адаптер Type C', checked: true },
            { id: 'ip6', group: 'road', name: 'Бутылка для воды', checked: true },
          ],
          expenses: [
            { id: 'ix1', cat: 'flight', title: 'Авиабилеты VKO–IST', amount: 42000, date: addDays(today, -55) },
            { id: 'ix2', cat: 'stay', title: 'Nevi Hotel, 5 ночей', amount: 34000, date: addDays(today, -54) },
            { id: 'ix3', cat: 'food', title: 'Кафе и ужины', amount: 18400, date: addDays(today, -43) },
            { id: 'ix4', cat: 'shopping', title: 'Специи и сладости домой', amount: 5200, date: addDays(today, -42) },
            { id: 'ix5', cat: 'transport', title: 'Istanbulkart и такси', amount: 3800, date: addDays(today, -42) },
          ],
        },
      ],
    };
  }

  /* ── вычисления ──────────────────────────────────────── */

  function activeTrip() {
    const db = state.db;
    return db.trips.find((t) => t.id === db.activeTripId) || db.trips[0];
  }

  function tripPhase(trip) {
    const today = todayYMD();
    if (today > trip.end) return 'past';
    if (today >= trip.start) return 'active';
    return 'upcoming';
  }

  function docsOf(trip) {
    return trip.documents || [];
  }

  function flightsOf(trip) {
    return docsOf(trip)
      .filter((d) => d.kind === 'flight')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function hotelOf(trip) {
    return docsOf(trip).find((d) => d.kind === 'hotel');
  }

  function eventDateTime(ev) {
    const t = ev.time && /^\d{1,2}:\d{2}/.test(ev.time) ? ev.time : '09:00';
    return new Date(`${ev.day}T${t.padStart(5, '0')}:00`);
  }

  function sortedEvents(trip) {
    return [...(trip.events || [])].sort((a, b) => eventDateTime(a) - eventDateTime(b));
  }

  function nextEvent(trip) {
    const now = new Date();
    const list = sortedEvents(trip);
    const next = list.find((ev) => eventDateTime(ev).getTime() + 60 * 60 * 1000 >= now.getTime());
    if (next) return next;
    return null;
  }

  function planDays(trip) {
    const days = [];
    const total = Math.max(1, daysUntil(trip.end) - daysUntil(trip.start) + 1);
    for (let i = 0; i < total; i++) days.push(addDays(trip.start, i));
    return days;
  }

  function docStatusScore(doc) {
    if (!doc) return 0;
    return doc.status === 'ok' ? 1 : doc.status === 'pending' ? 0.5 : 0;
  }

  function readiness(trip) {
    const f = flightsOf(trip);
    const flightScore = f.length >= 2 ? 1 : f.length === 1 ? 0.5 : 0;
    const hotel = hotelOf(trip);
    const stayScore = docStatusScore(hotel);
    const ins = docsOf(trip).find((d) => d.kind === 'insurance');
    const visa = docsOf(trip).find((d) => d.kind === 'visa');
    const insScore = docStatusScore(ins);
    const visaScore = trip.visaRequired ? docStatusScore(visa) : 1;

    const packing = trip.packing || [];
    const packDone = packing.filter((p) => p.checked).length;
    const packScore = packing.length ? packDone / packing.length : 0;

    const rows = [];

    rows.push({
      icon: 'plane',
      label: 'Билеты',
      meta: f.length >= 2 ? `${f.length} ${plural(f.length, ['билет', 'билета', 'билетов'])} · туда и обратно` : f.length === 1 ? 'только в одну сторону' : 'не добавлены',
      state: f.length >= 2 ? 'ok' : f.length === 1 ? 'warn' : 'bad',
    });

    rows.push({
      icon: 'bed',
      label: 'Жильё',
      meta: hotel ? `${hotel.meta?.nights ? `${hotel.meta.nights} ноч.` : 'забронировано'} · заезд ${dayMonth(hotel.meta?.checkIn || hotel.date)}` : 'не забронировано',
      state: hotel ? (hotel.status === 'ok' ? 'ok' : 'warn') : 'bad',
    });

    const docsLabel = (() => {
      if (!trip.visaRequired && ins) return ins.status === 'ok' ? 'страховка есть, виза не нужна' : 'страховка не оформлена';
      if (ins && visa) return ins.status === 'ok' && visa.status === 'ok' ? 'страховка и виза на месте' : ins.status !== 'ok' ? 'нет страховки' : 'виза не оформлена';
      if (!ins && !visa) return 'ничего не добавлено';
      return ins && ins.status !== 'ok' ? 'страховка не оформлена' : 'виза не оформлена';
    })();
    const docsScore = trip.visaRequired ? (insScore + visaScore) / 2 : ins ? insScore : 0;
    rows.push({
      icon: trip.visaRequired ? 'passport' : 'shield',
      label: 'Документы',
      meta: docsLabel,
      state: docsScore >= 1 ? 'ok' : docsScore > 0.5 ? 'warn' : 'bad',
    });

    rows.push({
      icon: 'bag',
      label: 'Вещи',
      meta: packing.length ? `${packDone} из ${packing.length} собрано` : 'список пуст',
      state: packScore >= 0.8 ? 'ok' : packScore > 0.4 ? 'warn' : 'bad',
    });

    const pct = Math.round((flightScore * 0.3 + stayScore * 0.3 + docsScore * 0.2 + packScore * 0.2) * 100);
    return { pct: clamp(pct, 0, 100), rows };
  }

  function budgetStats(trip) {
    const cats = trip.budget?.categories || [];
    const expenses = trip.expenses || [];
    const planned = cats.reduce((s, c) => s + (c.planned || 0), 0);
    const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const rows = cats.map((c, i) => {
      const s = expenses.filter((e) => e.cat === c.id).reduce((sum, e) => sum + (e.amount || 0), 0);
      return { ...c, spent: s, color: CAT_COLORS[i % CAT_COLORS.length], pct: c.planned ? Math.min(100, Math.round((s / c.planned) * 100)) : 0 };
    });
    return { planned, spent, left: planned - spent, pct: planned ? Math.min(100, Math.round((spent / planned) * 100)) : 0, rows, expenses };
  }

  function packStats(trip) {
    const list = trip.packing || [];
    const done = list.filter((p) => p.checked).length;
    return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  /* ── роутер ──────────────────────────────────────────── */

  const SHEET_ROUTES = {
    trips: () => renderTripsSheet(),
    newtrip: () => renderNewTripSheet(),
    adddoc: () => renderAddDocSheet(),
    addevent: () => renderAddEventSheet(),
    addexpense: () => renderAddExpenseSheet(),
    addmenu: () => renderAddMenuSheet(),
  };

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    // Telegram открывает приложение с хэшем #tgWebAppData=... — это не маршрут
    if (/tgWebApp/i.test(raw)) return { tab: 'overview', rest: [] };
    const parts = raw.split('/').filter(Boolean);
    return { tab: parts[0] || 'overview', rest: parts.slice(1) };
  }

  function applyRoute() {
    const { tab, rest } = parseHash();

    if (tab === 'sheet') {
      const key = rest[0] || '';
      if (key === 'doc' && rest[1]) {
        openDocSheet(rest[1]);
      } else if (SHEET_ROUTES[key]) {
        openSheet(SHEET_ROUTES[key]());
      } else {
        closeSheet(true);
      }
      return;
    }

    if (tab === 'docs' && rest[0] === 'filter' && rest[1] && DOC_FILTERS.some((f) => f.id === rest[1])) {
      state.docFilter = rest[1];
    }

    if (tab === 'plan' && /^\d+$/.test(rest[0] || '')) {
      const days = planDays(activeTrip());
      state.planDay = clamp(parseInt(rest[0], 10), 0, days.length - 1);
    }

    if (tab === 'packing' && rest[0] === 'budget') {
      state.packTab = 'budget';
    } else if (tab === 'packing') {
      state.packTab = 'list';
    }

    if (!TABS.includes(tab) && tab !== 'sheet') {
      state.tab = 'overview';
      closeSheet(true);
      render();
      setActiveTab();
      return;
    }

    if (TABS.includes(tab)) {
      const tabChanged = state.tab !== tab;
      state.tab = tab;
      closeSheet(true);
      render();
      setActiveTab();
      if (tabChanged) window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function navigate(hash) {
    if (location.hash === hash) {
      applyRoute();
      return;
    }
    location.hash = hash;
  }

  /* ── Telegram ────────────────────────────────────────── */

  function bootTelegram() {
    const insideTelegram = /tgWebAppData|tgWebAppPlatform/.test(location.hash + location.search) || !!window.TelegramWebviewProxy;

    const load = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://telegram.org/js/telegram-web-app.js';
      s.async = true;
      const done = () => resolve();
      s.onload = done;
      s.onerror = done;
      setTimeout(done, insideTelegram ? 5000 : 1200);
      document.head.appendChild(s);
    });

    const apply = () => {
      const tg = window.Telegram?.WebApp;
      if (!tg) return;
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0A0E16');
        tg.setBackgroundColor('#0A0E16');
        if (tg.BackButton) {
          tg.BackButton.onClick(() => {
            if (state.sheet) closeSheet();
            else history.back();
          });
        }
      } catch {}
    };

    if (insideTelegram) load.then(apply);
    else load.then(apply);
  }

  /* ── общие куски разметки ────────────────────────────── */

  function statusLabel(status) {
    if (status === 'pending') return 'ждёт подтверждения';
    if (status === 'missing') return 'не оформлено';
    return 'подтверждено';
  }

  function docCard(doc, trip) {
    const kind = KINDS[doc.kind] || KINDS.other;
    const open = `data-action="open-doc" data-id="${esc(doc.id)}"`;
    const stateCls = doc.status === 'pending' ? 'pending' : doc.status === 'missing' ? 'missing' : '';

    if (doc.kind === 'flight' && doc.meta?.from?.code) {
      const m = doc.meta;
      return `
        <button class="ticket" ${open} style="--perf:64%">
          <div class="ticket-head">
            <span class="ticket-head-left">${ico('plane')} Авиабилет · ${esc(m.airline || '')}</span>
            <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
          </div>
          <div class="ticket-route">
            <div class="ticket-end">
              <div class="ticket-code">${esc(m.from.code)}</div>
              <div class="ticket-city">${esc(m.from.city)}${m.from.terminal ? ` · ${esc(m.from.terminal)}` : ''} · ${dayMonth(m.from.date)}</div>
            </div>
            <div class="ticket-mid">
              <div class="ticket-plane-line">${ico('plane')}</div>
              <div class="ticket-dur">${esc(m.duration || '—')}</div>
            </div>
            <div class="ticket-end" style="text-align:right">
              <div class="ticket-code">${esc(m.to.code)}</div>
              <div class="ticket-city">${esc(m.to.city)}${m.to.terminal ? ` · ${esc(m.to.terminal)}` : ''} · ${dayMonth(m.to.date)}</div>
            </div>
          </div>
          <div class="ticket-grid">
            <div class="ticket-cell"><span>Вылет</span><b>${esc(m.from.time)}</b></div>
            <div class="ticket-cell"><span>Прилёт</span><b>${esc(m.to.time)}</b></div>
            <div class="ticket-cell"><span>Рейс</span><b>${esc(m.number || '—')}</b></div>
            <div class="ticket-cell"><span>Место</span><b>${esc(m.seat || '—')}</b></div>
          </div>
          <div class="ticket-foot">
            <span>PNR <b>${esc(m.pnr || '—')}</b></span>
            <span>${esc(m.baggage ? `Багаж ${m.baggage}` : '')}</span>
          </div>
        </button>`;
    }

    if (doc.kind === 'hotel') {
      const m = doc.meta || {};
      return `
        <button class="ticket ${kind.tint}" ${open} style="--perf:62%">
          <div class="ticket-head">
            <span class="ticket-head-left">${ico('bed')} Отель</span>
            <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
          </div>
          <div class="hotel-name">${esc(m.name || doc.title)}</div>
          <div class="hotel-addr">${esc(m.address || '')}</div>
          <div class="hotel-dates">
            <div class="hotel-date"><span>Заезд</span><b>${dayMonth(m.checkIn || doc.date)}</b></div>
            <div class="hotel-nights">${m.nights || 0} ${plural(m.nights || 0, ['ночь', 'ночи', 'ночей'])}</div>
            <div class="hotel-date" style="text-align:right"><span>Выезд</span><b>${dayMonth(m.checkOut || doc.date)}</b></div>
          </div>
          <div class="ticket-foot">
            <span>Бронь <b>${esc(m.booking || '—')}</b></span>
            <span>${esc(m.room || '')}</span>
          </div>
        </button>`;
    }

    return `
      <button class="ticket ${kind.tint}" ${open} style="--perf:60%">
        <div class="ticket-head">
          <span class="ticket-head-left">${ico(kind.icon)} ${esc(kind.label)}</span>
          <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
        </div>
        <div class="doc-generic-title">${esc(doc.title)}</div>
        <div class="doc-generic-sub">${esc(doc.meta?.place || doc.meta?.provider || doc.meta?.operator || doc.meta?.country || '')}</div>
        <div class="doc-generic-row">
          <span>${doc.kind === 'insurance' && doc.meta?.validTo ? `до ${dayMonth(doc.meta.validTo)}` : doc.date ? `${dayMonthFull(doc.date)}${doc.time ? ` · ${esc(doc.time)}` : ''}` : '—'}</span>
          <b>${esc(doc.meta?.code || doc.meta?.policy || doc.meta?.booking || '')}</b>
        </div>
      </button>`;
  }

  function miniTicket(doc) {
    const kind = KINDS[doc.kind] || KINDS.other;
    const m = doc.meta || {};
    if (doc.kind === 'flight') {
      return `
        <button class="mini-ticket" data-action="open-doc" data-id="${esc(doc.id)}">
          <div class="mini-ticket top">
            <span>${esc(m.airline || 'Рейс')}</span>
            <span class="mini-ico">${ico('plane')}</span>
          </div>
          <div class="mini-codes">
            ${esc(m.from.code)} ${ico('arrow', '')} ${esc(m.to.code)}
          </div>
          <div class="mini-title">${esc(doc.title)}</div>
          <div class="mini-foot">
            <span>${esc(m.from.time)} · ${dayMonth(m.from.date)}</span>
            <span>${esc(m.number || '')}</span>
          </div>
        </button>`;
    }
    if (doc.kind === 'hotel') {
      return `
        <button class="mini-ticket" data-action="open-doc" data-id="${esc(doc.id)}">
          <div class="mini-ticket top">
            <span>${esc(kind.label)}</span>
            <span class="mini-ico">${ico('bed')}</span>
          </div>
          <div class="mini-title" style="margin-top:10px;font-size:14px">${esc(m.name || doc.title)}</div>
          <div class="mini-foot">
            <span>${dayMonth(m.checkIn)} – ${dayMonth(m.checkOut)}</span>
            <span>${m.nights} ноч.</span>
          </div>
        </button>`;
    }
    return `
      <button class="mini-ticket" data-action="open-doc" data-id="${esc(doc.id)}">
        <div class="mini-ticket top">
          <span>${esc(kind.label)}</span>
          <span class="mini-ico">${ico(kind.icon)}</span>
        </div>
        <div class="mini-title" style="margin-top:12px;font-size:14px">${esc(doc.title)}</div>
        <div class="mini-foot">
          <span>${doc.date ? dayMonth(doc.date) : ''}</span>
          <span>${esc(m.code || '')}</span>
        </div>
      </button>`;
  }

  /* ── экран «Обзор» ───────────────────────────────────── */

  function viewOverview(trip) {
    const phase = tripPhase(trip);
    const past = phase === 'past';
    const days = daysUntil(trip.start);
    const nights = daysUntil(trip.end) - daysUntil(trip.start);
    const ready = readiness(trip);
    const bud = budgetStats(trip);
    const pack = packStats(trip);
    const ev = nextEvent(trip);
    const flights = flightsOf(trip);
    const out = flights[0];
    const back = flights.length > 1 ? flights[flights.length - 1] : null;

    const chipText = past
      ? `${daysToText(days)}`
      : phase === 'active'
        ? `вы в поездке · ${plural(Math.abs(days), ['день', 'дня', 'дней'])} ${days === 0 ? 'сегодня' : 'назад старт'}`
        : days === 0
          ? 'вылет сегодня'
          : daysToText(days);

    const hero = `
      <section class="hero">
        <span class="hero-glyph" aria-hidden="true">${esc(trip.glyph || '')}</span>
        <div class="hero-top">
          <span class="hero-chip ${past ? 'done' : ''}"><i class="dot"></i>${chipText}</span>
          <span class="hero-chip">${ico('clock')} <b class="mono" data-live-time="${esc(trip.tz)}" style="font-weight:700">${localTime(trip.tz)}</b>&nbsp;на месте</span>
        </div>
        <div class="hero-city">
          <h1>${esc(trip.city)}</h1>
          <span class="hero-country">${esc(trip.country)}</span>
        </div>
        <div class="hero-dates"><b>${rangeFull(trip.start, trip.end)}</b> · ${nights + 1} ${plural(nights + 1, ['день', 'дня', 'дней'])}${trip.companions?.length ? ` · с ${esc(trip.companions.join(', '))}` : ''}</div>
        <div class="hero-meta">
          <div class="hero-meta-item">
            <span class="hero-meta-label">Погода</span>
            <span class="hero-meta-value">${trip.weather ? `${trip.weather.temp > 0 ? '+' : ''}${trip.weather.temp}° <small>${esc(trip.weather.label)}</small>` : '—'}</span>
          </div>
          <div class="hero-meta-item">
            <span class="hero-meta-label">Разница во времени</span>
            <span class="hero-meta-value">${tzDiffLabel(trip.tz)}</span>
          </div>
        </div>
      </section>`;

    const stub = !past && out?.meta?.from?.code
      ? `
      <div class="stub">
        <div class="stub-row">
          <div class="stub-codes">
            <div>
              <span class="stub-code">${esc(out.meta.from.code)}</span>
              <span class="stub-city">${esc(out.meta.from.city)}</span>
            </div>
            <div class="stub-path">${ico('plane')}</div>
            <div style="text-align:right">
              <span class="stub-code">${esc(out.meta.to.code)}</span>
              <span class="stub-city" style="margin-left:auto">${esc(out.meta.to.city)}</span>
            </div>
          </div>
          <div class="stub-times">${esc(out.meta.from.time)}<br>→ ${esc(out.meta.to.time)}</div>
        </div>
        <div class="stub-bottom">
          <span>${esc(out.meta.airline)} ${esc(out.meta.number)} · ${dayMonthFull(out.meta.from.date)}</span>
          <span>${back ? `обратно ${dayMonth(back.meta.from.date)}` : 'обратный билет не добавлен'}</span>
        </div>
      </div>`
      : '';

    const quick = `
      <div class="quick" style="margin-top:16px">
        <button class="quick-btn" data-action="nav" data-href="#/sheet/adddoc">${ico('ticket')} Билет или бронь</button>
        <button class="quick-btn" data-action="nav" data-href="#/sheet/addevent">${ico('calendar')} Событие</button>
        <button class="quick-btn" data-action="nav" data-href="#/sheet/addexpense">${ico('wallet')} Трата</button>
        <button class="quick-btn ghost" data-action="nav" data-href="#/packing">${ico('bag')} Собрать вещи</button>
      </div>`;

    const pastBanner = past
      ? `<div class="past-banner">${ico('history')} Поездка в архиве — можно пересмотреть брони и траты, но менять план уже не нужно.</div>`
      : '';

    const nextBlock = !past && ev
      ? `
      <section class="section">
        <div class="section-head">
          <h2>Ближайшее</h2>
          <a class="link" href="#/plan">Весь план →</a>
        </div>
        <div class="next-card">
          <div class="next-when">
            <div class="next-day mono">${parseDay(ev.day).getDate()}</div>
            <div class="next-month">${MONTHS_SHORT[parseDay(ev.day).getMonth()]} · ${dow(ev.day)}</div>
            <div class="next-time">${esc(ev.time || '')}</div>
          </div>
          <div class="next-body">
            <div class="next-kind">${ico(EVENT_ICONS[ev.kind] || 'pin')} ${esc(kindTitle(ev.kind))}</div>
            <div class="next-title">${esc(ev.title)}</div>
            <div class="next-sub">${esc(ev.sub || '')}</div>
            <div class="next-count">${ico('clock')} <span data-live-count="${esc(ev.day)}T${esc(ev.time || '09:00')}">${untilText(`${ev.day}T${ev.time || '09:00'}:00`)}</span></div>
          </div>
        </div>
      </section>`
      : '';

    const readyBlock = past
      ? ''
      : `
      <section class="card ready" style="margin-top:18px">
        <div class="ready-head">
          <h2>Готовность к поездке</h2>
          <div class="ready-pct">${ready.pct}<span>%</span></div>
        </div>
        <div class="progress"><i style="width:${ready.pct}%"></i></div>
        <div class="ready-list">
          ${ready.rows.map((r) => `
            <div class="ready-row">
              <span class="ready-ico">${ico(r.icon)}</span>
              <span class="ready-text">
                <span class="ready-name">${r.label}</span>
                <span class="ready-meta">${r.meta}</span>
              </span>
              <span class="ready-state ${r.state}">${r.state === 'ok' ? 'ок' : r.state === 'warn' ? 'частично' : 'не готово'}</span>
            </div>`).join('')}
        </div>
      </section>`;

    const budgetBlock = bud.planned === 0
      ? `<section class="section">
          <div class="section-head"><h2>Бюджет</h2></div>
          <div class="empty" style="padding:22px 18px">
            <div class="empty-ico">${ico('wallet')}</div>
            <h3>Бюджет пока не задан</h3>
            <p>Добавь первую трату — покажу, сколько ушло и сколько осталось на день.</p>
            <button class="btn small" data-action="nav" data-href="#/sheet/addexpense">Добавить трату</button>
          </div>
        </section>`
      : `
      <section class="section">
        <div class="section-head">
          <h2>Бюджет</h2>
          <a class="link" href="#/packing/budget">Траты →</a>
        </div>
        <a class="card" href="#/packing/budget" style="display:block">
          <div class="budget-head">
            <div class="budget-sum">${money(bud.spent)}<small>из ${money(bud.planned)}</small></div>
            <div class="budget-left">
              <b>${bud.planned - bud.spent >= 0 ? 'осталось ' + money(bud.planned - bud.spent) : 'перерасход ' + money(bud.spent - bud.planned)}</b>
              <span>${bud.pct}% бюджета</span>
            </div>
          </div>
          <div class="stack-bar">
            ${bud.rows.filter((c) => c.planned > 0).map((c) => `<i style="width:${(c.planned / bud.planned) * 100}%;background:${c.color}"></i>`).join('')}
          </div>
          <div class="legend">
            ${bud.rows.slice(0, 4).map((c) => `<span class="legend-item"><i class="legend-dot" style="background:${c.color}"></i>${esc(c.name)} <b>${num(c.planned)}</b></span>`).join('')}
          </div>
        </a>
      </section>`;

    const docsPreview = docsOf(trip).filter((d) => d.status !== 'missing');
    const docsBlock = docsPreview.length
      ? `
      <section class="section">
        <div class="section-head">
          <h2>Под рукой</h2>
          <a class="link" href="#/docs">Все документы →</a>
        </div>
        <div class="hscroll">
          ${docsPreview.slice(0, 4).map(miniTicket).join('')}
        </div>
      </section>`
      : '';

    const tripStats = past
      ? `<section class="card" style="margin-top:18px;display:flex;gap:12px;align-items:flex-start">
          <div style="flex:1"><div class="hero-meta-label">Дней</div><div class="budget-sum" style="font-size:19px;white-space:nowrap">${nights + 1}</div></div>
          <div style="flex:1"><div class="hero-meta-label">Потрачено</div><div class="budget-sum" style="font-size:19px;white-space:nowrap">${money(bud.spent)}</div></div>
          <div style="flex:1"><div class="hero-meta-label">Событий</div><div class="budget-sum" style="font-size:19px;white-space:nowrap">${(trip.events || []).length}</div></div>
        </section>`
      : '';

    return `
      ${pastBanner}
      ${hero}
      ${stub}
      ${quick}
      ${nextBlock}
      ${readyBlock}
      ${tripStats}
      ${budgetBlock}
      ${docsBlock}
      <p class="dim" style="font-size:11px;line-height:1.5;margin:20px 2px 0;text-align:center">Данные хранятся на этом телефоне. Всё можно менять.</p>`;
  }

  /* ── экран «План» ────────────────────────────────────── */

  function kindTitle(kind) {
    return {
      flight: 'Перелёт',
      train: 'Поезд',
      hotel: 'Отель',
      food: 'Еда',
      walk: 'Прогулка',
      activity: 'Впечатление',
      move: 'Дорога',
      rest: 'Отдых',
    }[kind] || 'Событие';
  }

  function viewPlan(trip) {
    const days = planDays(trip);
    const events = sortedEvents(trip);
    let idx = state.planDay;
    if (idx == null) {
      const today = todayYMD();
      const found = days.indexOf(today);
      idx = found >= 0 ? found : 0;
      state.planDay = idx;
    }
    idx = clamp(idx, 0, days.length - 1);
    const day = days[idx];
    const dayEvents = events.filter((e) => e.day === day);
    const counts = days.map((d) => events.filter((e) => e.day === d).length);

    const strip = days
      .map((d, i) => `
        <a class="day-pill ${i === idx ? 'is-active' : ''}" href="#/plan/${i}">
          <span class="dow">${dow(d)}</span>
          <span class="dnum">${parseDay(d).getDate()}</span>
          <span class="day-dots">${Array.from({ length: Math.min(3, counts[i]) }).map(() => '<i></i>').join('')}</span>
        </a>`)
      .join('');

    const dayBody = dayEvents.length
      ? (() => {
          // вставляем окна после соответствующих событий
          let out = '';
          for (let i = 0; i < dayEvents.length; i++) {
            const ev = dayEvents[i];
            const dotCls = ev.kind === 'hotel' ? 'bed' : ev.kind === 'food' ? 'food' : ['walk', 'activity', 'rest'].includes(ev.kind) ? 'walk' : '';
            const inner = `
              <div class="tl-title">${ico(EVENT_ICONS[ev.kind] || 'pin')}${esc(ev.title)}</div>
              ${ev.sub ? `<div class="tl-sub">${esc(ev.sub)}</div>` : ''}
              ${ev.docId ? `<div class="tl-tags"><span class="tl-tag">${ico('ticket')} документ прикреплён</span></div>` : ''}`;
            out += `
              <div class="tl-item">
                <div class="tl-time">${esc(ev.time || '—')}</div>
                <div class="tl-rail">
                  <span class="tl-dot ${dotCls}"></span>
                  ${ev.docId ? `<a class="tl-card" href="#/sheet/doc/${esc(ev.docId)}">${inner}</a>` : `<div class="tl-card">${inner}</div>`}
                </div>
              </div>`;
            const next = dayEvents[i + 1];
            if (next && /^\d{1,2}:\d{2}/.test(ev.time || '') && /^\d{1,2}:\d{2}/.test(next.time || '')) {
              const gap = (eventDateTime(next) - eventDateTime(ev)) / 60000;
              if (gap >= 240 && !['flight', 'train', 'hotel', 'move'].includes(ev.kind) && !['flight', 'train', 'hotel', 'move'].includes(next.kind)) {
                out += `<div class="free-window">${ico('sparkles')}<div><b>Свободно ${Math.floor(gap / 60)} ч${gap % 60 ? ` ${gap % 60} мин` : ''}</b>${esc(ev.time)}–${esc(next.time)}. Можно добавить прогулку или оставить как есть.</div></div>`;
              }
            }
          }
          return out;
        })()
      : `<div class="empty">
          <div class="empty-ico">${ico('calendar')}</div>
          <h3>День пока свободен</h3>
          <p>Добавь перелёт, отель или прогулку — всё появится в плане по времени.</p>
          <button class="btn small" data-action="nav" data-href="#/sheet/addevent">Добавить событие</button>
        </div>`;

    return `
      <div class="day-strip">${strip}</div>
      <div class="plan-date">
        <h2>${dayMonthFull(day)}</h2>
        <span>${dowFull(day)} · день ${idx + 1} из ${days.length}</span>
      </div>
      <div class="timeline">${dayBody}</div>
      ${dayEvents.length ? `<button class="add-row" data-action="nav" data-href="#/sheet/addevent">${ico('plus')} Добавить событие в этот день</button>` : ''}`;
  }

  /* ── экран «Документы» ───────────────────────────────── */

  function viewDocs(trip) {
    const docs = docsOf(trip);
    const filter = state.docFilter;
    const filtered = docs.filter((d) => d.status !== 'missing' && (filter === 'all' || (KINDS[d.kind] || KINDS.other).group === filter));
    const counts = {};
    DOC_FILTERS.forEach((f) => {
      counts[f.id] = f.id === 'all' ? docs.length : docs.filter((d) => (KINDS[d.kind] || KINDS.other).group === f.id).length;
    });

    const chips = DOC_FILTERS
      .map((f) => `<a class="chip ${filter === f.id ? 'is-active' : ''}" href="#/docs/filter/${f.id}">${f.label}${counts[f.id] ? ` · ${counts[f.id]}` : ''}</a>`)
      .join('');

    const missing = docs.filter((d) => d.status === 'missing' && (filter === 'all' || (KINDS[d.kind] || KINDS.other).group === filter));

    const list = filtered.length
      ? `<div class="doc-list">${filtered.map((d) => docCard(d, trip)).join('')}</div>`
      : `<div class="empty">
          <div class="empty-ico">${ico('ticket')}</div>
          <h3>Здесь пока пусто</h3>
          <p>Билеты, отели, страховка и билеты на события — всё в одном списке.</p>
          <button class="btn small" data-action="nav" data-href="#/sheet/adddoc">Добавить документ</button>
        </div>`;

    const missingBlock = missing.length
      ? missing.map((d) => `
        <button class="missing-card" data-action="open-doc" data-id="${esc(d.id)}" style="margin-top:12px">
          <span class="mc-ico">${ico(KINDS[d.kind]?.icon || 'doc')}</span>
          <span class="mc-text">
            <span class="mc-title">${esc(d.title)} — не оформлено</span>
            <span class="mc-sub">${esc(d.meta?.note || 'Добавь, когда будет готово')}</span>
          </span>
          <span class="mc-plus">+</span>
        </button>`).join('')
      : '';

    return `
      <div class="filters">${chips}</div>
      ${list}
      ${filter === 'all' || filter === 'docs' ? missingBlock : ''}
      <button class="add-row" data-action="nav" data-href="#/sheet/adddoc">${ico('plus')} Добавить билет, бронь или документ</button>
      <p class="dim" style="font-size:11px;line-height:1.5;margin:16px 2px 0;text-align:center">Нажми на карточку — откроются детали и код брони.</p>`;
  }

  /* ── экран «Сборы» / «Бюджет» ────────────────────────── */

  function viewPacking(trip) {
    const seg = `
      <div class="segmented">
        <a class="seg-btn ${state.packTab === 'list' ? 'is-active' : ''}" href="#/packing">Сборы</a>
        <a class="seg-btn ${state.packTab === 'budget' ? 'is-active' : ''}" href="#/packing/budget">Бюджет</a>
      </div>`;

    return seg + (state.packTab === 'budget' ? viewBudget(trip) : viewChecklist(trip));
  }

  function viewChecklist(trip) {
    const stats = packStats(trip);
    const groups = PACK_GROUPS.map((g) => {
      const items = (trip.packing || []).filter((p) => p.group === g.id);
      if (!items.length) return '';
      const done = items.filter((p) => p.checked).length;
      return `
        <div class="pack-group">
          <div class="pack-group-head">
            <span class="pg-dot" style="background:${g.color}"></span>${g.name}
            <span class="pg-count">${done}/${items.length}</span>
          </div>
          ${items.map((p) => `
            <button class="pack-item ${p.checked ? 'is-done' : ''}" data-action="toggle-pack" data-id="${esc(p.id)}">
              <span class="pack-check">${ico('check')}</span>
              <span class="pack-name">${esc(p.name)}</span>
            </button>`).join('')}
        </div>`;
    }).join('');

    return `
      <div class="pack-head">
        <div class="ring">
          <svg viewBox="0 0 58 58"><circle class="ring-bg" cx="29" cy="29" r="24"/><circle class="ring-fg" cx="29" cy="29" r="24" style="stroke-dashoffset:${150.8 - (150.8 * stats.pct) / 100}"/></svg>
          <span class="ring-num">${stats.pct}%</span>
        </div>
        <div class="pack-info">
          <h2>Собрано ${stats.done} из ${stats.total}</h2>
          <p>${tripPhase(trip) === 'past' ? 'Поездка завершена' : stats.pct === 100 ? 'Всё на месте, можно выезжать' : stats.pct > 60 ? 'Осталось немного' : 'Начни с документов и денег'}</p>
          <div class="progress"><i style="width:${stats.pct}%"></i></div>
        </div>
      </div>
      ${groups}
      <form class="pack-add" data-form="addpack">
        <input class="input" name="name" placeholder="Например, зонт" autocomplete="off" maxlength="60" />
        <button class="btn small" type="submit">Добавить</button>
      </form>
      <p class="dim" style="font-size:11px;line-height:1.5;margin:16px 2px 0;text-align:center">Отметь вещи — прогресс сразу видно на дашборде.</p>`;
  }

  function viewBudget(trip) {
    const bud = budgetStats(trip);
    const expenses = [...(trip.expenses || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);

    const cats = bud.rows
      .map((c) => `
        <div class="cat-row">
          <div class="cat-top">
            <i class="legend-dot" style="background:${c.color}"></i>
            <span class="cat-name">${esc(c.name)}</span>
            <span class="cat-val"><b>${num(c.spent)}</b> / ${num(c.planned)} ₽</span>
          </div>
          <div class="cat-bar"><i style="width:${c.pct}%;background:${c.color}"></i></div>
        </div>`)
      .join('');

    const expList = expenses.length
      ? expenses.map((e) => {
          const c = bud.rows.find((r) => r.id === e.cat);
          return `
            <div class="expense">
              <span class="exp-ico" style="color:${c?.color || 'var(--muted)'}">${ico('wallet')}</span>
              <span class="exp-text">
                <span class="exp-title">${esc(e.title)}</span>
                <span class="exp-sub">${esc(c?.name || 'Прочее')} · ${dayMonthFull(e.date)}</span>
              </span>
              <span class="exp-sum">${money(e.amount)}</span>
            </div>`;
        }).join('')
      : `<div class="empty" style="margin-top:8px"><div class="empty-ico">${ico('wallet')}</div><h3>Трат пока нет</h3><p>Записывай расходы — и увидишь, сколько осталось на день.</p></div>`;

    return `
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(var(--coral) 0 ${bud.pct}%, rgba(245,241,232,.08) ${bud.pct}% 100%)">
          <div class="donut-center"><div><div class="donut-pct">${bud.pct}%</div><div class="donut-lbl">бюджета</div></div></div>
        </div>
        <div class="budget-figures">
          <div class="bf-num">${money(bud.spent)}</div>
          <div class="bf-sub">потрачено из ${money(bud.planned)}</div>
          <div class="bf-left">${bud.left >= 0 ? `осталось <b>${money(bud.left)}</b>` : `перерасход <b>${money(-bud.left)}</b>`}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">${cats}</div>

      <div class="section-head">
        <h2>Последние траты</h2>
        <button class="link" data-action="nav" data-href="#/sheet/addexpense">Добавить</button>
      </div>
      <div class="card">${expList}</div>
      <p class="dim" style="font-size:11px;line-height:1.5;margin:16px 2px 0;text-align:center">Бюджет считается по плану и фактическим тратам.</p>`;
  }

  /* ── рендер ──────────────────────────────────────────── */

  function render(animate = true) {
    const main = $('#main');
    const trip = activeTrip();
    if (!trip) return;

    let html = '';
    if (state.tab === 'overview') html = viewOverview(trip);
    else if (state.tab === 'plan') html = viewPlan(trip);
    else if (state.tab === 'docs') html = viewDocs(trip);
    else html = viewPacking(trip);

    main.innerHTML = `<div class="screen${animate ? ' screen-anim' : ''}">${html}</div>`;
    setActiveTab();
    updatePill();
    updateFab();
    tick();
  }

  function setActiveTab() {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === state.tab));
  }

  function updatePill() {
    const trip = activeTrip();
    if (!trip) return;
    $('#tripPillText').textContent = trip.title;
    const dot = $('.trip-pill-dot');
    if (dot) dot.style.background = tripPhase(trip) === 'past' ? 'var(--faint)' : 'var(--lagoon)';
  }

  function updateFab() {
    const fab = $('#fab');
    if (!fab) return;
    fab.dataset.action = 'addmenu';
    fab.setAttribute('aria-label', 'Добавить');
  }

  /** обновляет часы и обратные отсчёты без перерисовки экрана */
  function tick() {
    $$('[data-live-time]').forEach((el) => {
      el.textContent = localTime(el.dataset.liveTime);
    });
    $$('[data-live-count]').forEach((el) => {
      el.textContent = untilText(`${el.dataset.liveCount}:00`);
    });
  }

  /* ── шторки ──────────────────────────────────────────── */

  function sheetShell({ title, body, foot = '' }) {
    return `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grip"></div>
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
          <button class="sheet-close" data-action="close-sheet" aria-label="Закрыть">${ico('x')}</button>
        </div>
        <div class="sheet-body">${body}</div>
        ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
      </div>`;
  }

  function openSheet(html) {
    const root = $('#sheetRoot');
    root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>${html}`;
    root.setAttribute('aria-hidden', 'false');
    state.sheet = true;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => root.classList.add('is-open'));
  }

  function closeSheet(silent = false) {
    const root = $('#sheetRoot');
    if (!root) return;
    root.classList.remove('is-open');
    state.sheet = null;
    document.body.style.overflow = '';
    if (!silent) navigate('#/' + state.tab);
    setTimeout(() => {
      if (!root.classList.contains('is-open')) {
        root.innerHTML = '';
        root.setAttribute('aria-hidden', 'true');
      }
    }, 380);
  }

  /* ── поездки ─────────────────────────────────────────── */

  function renderTripsSheet() {
    const db = state.db;
    const options = db.trips
      .map((t) => {
        const phase = tripPhase(t);
        const sub = `${rangeShort(t.start, t.end)} · ${phase === 'past' ? 'архив' : phase === 'active' ? 'сейчас в поездке' : daysToText(daysUntil(t.start))}`;
        return `
          <button class="trip-option ${t.id === db.activeTripId ? 'is-active' : ''}" data-action="switch-trip" data-id="${esc(t.id)}">
            <span class="trip-thumb ${esc(t.gradient || '')}">${esc(t.glyph || t.city.slice(0, 2).toUpperCase())}</span>
            <span class="trip-opt-text">
              <span class="trip-opt-title">${esc(t.city)}${t.country ? `, ${esc(t.country)}` : ''}</span>
              <span class="trip-opt-sub">${esc(sub)}</span>
            </span>
            ${t.id === db.activeTripId ? `<span class="trip-opt-check">${ico('check')}</span>` : ''}
          </button>`;
      })
      .join('');

    const body = `
      ${options}
      <button class="add-row" data-action="nav" data-href="#/sheet/newtrip">${ico('plus')} Новая поездка</button>
      <div class="sheet-note">Пока всё хранится на этом телефоне. Не чисти данные браузера — поездки пропадут.</div>
      <button class="add-row" data-action="export" style="margin-top:8px">${ico('doc')} Скачать копию данных</button>
      <button class="add-row" data-action="reset-demo" style="margin-top:4px;color:var(--faint);border-color:rgba(245,241,232,.12)">Сбросить демо-данные</button>`;

    return sheetShell({ title: 'Мои поездки', body });
  }

  function renderNewTripSheet() {
    const today = todayYMD();
    const tzOptions = [
      ['Europe/Moscow', 'Москва (UTC+3)'],
      ['Europe/Lisbon', 'Лиссабон (UTC+0)'],
      ['Europe/Istanbul', 'Стамбул (UTC+3)'],
      ['Europe/Paris', 'Париж (UTC+2)'],
      ['Asia/Dubai', 'Дубай (UTC+4)'],
      ['Asia/Tokyo', 'Токио (UTC+9)'],
      ['Asia/Bangkok', 'Бангкок (UTC+7)'],
      ['Asia/Tbilisi', 'Тбилиси (UTC+4)'],
      ['Asia/Yerevan', 'Ереван (UTC+4)'],
      ['America/New_York', 'Нью-Йорк (UTC−4)'],
    ].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const body = `
      <form id="form-newtrip" data-form="newtrip">
        <div class="field">
          <label for="nt-city">Город</label>
          <input class="input" id="nt-city" name="city" placeholder="Лиссабон" required maxlength="40" />
        </div>
        <div class="field">
          <label for="nt-country">Страна</label>
          <input class="input" id="nt-country" name="country" placeholder="Португалия" maxlength="40" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="nt-start">Начало</label>
            <input class="input" id="nt-start" type="date" name="start" value="${addDays(today, 30)}" required />
          </div>
          <div class="field">
            <label for="nt-end">Конец</label>
            <input class="input" id="nt-end" type="date" name="end" value="${addDays(today, 37)}" required />
          </div>
        </div>
        <div class="field">
          <label for="nt-tz">Часовой пояс</label>
          <select class="input" id="nt-tz" name="tz">${tzOptions}</select>
        </div>
      </form>`;

    return sheetShell({
      title: 'Новая поездка',
      body,
      foot: `<button class="btn block" type="submit" form="form-newtrip">Создать поездку</button>`,
    });
  }

  /* ── добавление документа ────────────────────────────── */

  function renderAddDocSheet() {
    const today = todayYMD();
    const kinds = ['flight', 'hotel', 'train', 'activity', 'insurance', 'visa', 'car', 'other'];
    const kindOpts = kinds
      .map((k, i) => `
        <label class="kind-opt ${i === 0 ? 'is-active' : ''}">
          <input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''} />
          ${ico(KINDS[k].icon)}
          <span>${KINDS[k].label}</span>
        </label>`)
      .join('');

    const body = `
      <form id="form-adddoc" data-form="adddoc">
        <div class="field">
          <label>Что добавляем</label>
          <div class="kind-grid">${kindOpts}</div>
        </div>
        <div class="field">
          <label for="ad-title">Название</label>
          <input class="input" id="ad-title" name="title" placeholder="Например, отель в центре" required maxlength="60" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ad-date">Дата</label>
            <input class="input" id="ad-date" type="date" name="date" value="${today}" />
          </div>
          <div class="field">
            <label for="ad-time">Время</label>
            <input class="input" id="ad-time" type="time" name="time" />
          </div>
        </div>
        <div class="field">
          <label for="ad-place">Место или адрес</label>
          <input class="input" id="ad-place" name="place" placeholder="Аэропорт, отель, адрес" maxlength="80" />
        </div>
        <div class="field">
          <label for="ad-code">Код брони / номер</label>
          <input class="input" id="ad-code" name="code" placeholder="PNR, номер брони или билета" maxlength="30" autocomplete="off" />
        </div>
        <div class="field">
          <label for="ad-status">Статус</label>
          <select class="input" id="ad-status" name="status">
            <option value="ok">Подтверждено</option>
            <option value="pending">Ждёт подтверждения</option>
            <option value="missing">Ещё не оформлено</option>
          </select>
        </div>
      </form>`;

    return sheetShell({
      title: 'Новый документ',
      body,
      foot: `<button class="btn block" type="submit" form="form-adddoc">Сохранить</button>`,
    });
  }

  /* ── событие в план ──────────────────────────────────── */

  function renderAddEventSheet() {
    const trip = activeTrip();
    const days = planDays(trip);
    const selectedDay = days[state.planDay] || days[0];
    const dayOpts = days
      .map((d) => `<option value="${d}" ${d === selectedDay ? 'selected' : ''}>${dayMonthFull(d)} · ${dow(d)}</option>`)
      .join('');
    const kindOpts = ['walk', 'food', 'activity', 'flight', 'train', 'hotel', 'move', 'rest']
      .map((k) => `<option value="${k}">${kindTitle(k)}</option>`)
      .join('');

    const body = `
      <form id="form-addevent" data-form="addevent">
        <div class="field">
          <label for="ae-title">Что происходит</label>
          <input class="input" id="ae-title" name="title" placeholder="Прогулка по центру" required maxlength="70" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ae-day">День</label>
            <select class="input" id="ae-day" name="day">${dayOpts}</select>
          </div>
          <div class="field">
            <label for="ae-time">Время</label>
            <input class="input" id="ae-time" type="time" name="time" value="10:00" />
          </div>
        </div>
        <div class="field">
          <label for="ae-kind">Тип</label>
          <select class="input" id="ae-kind" name="kind">${kindOpts}</select>
        </div>
        <div class="field">
          <label for="ae-sub">Детали</label>
          <input class="input" id="ae-sub" name="sub" placeholder="Адрес, заметка, ссылка" maxlength="90" />
        </div>
      </form>`;

    return sheetShell({
      title: 'Событие в план',
      body,
      foot: `<button class="btn block" type="submit" form="form-addevent">Добавить в план</button>`,
    });
  }

  /* ── трата ───────────────────────────────────────────── */

  function renderAddExpenseSheet() {
    const trip = activeTrip();
    const cats = (trip.budget?.categories || []).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const today = todayYMD();

    const body = `
      <form id="form-addexpense" data-form="addexpense">
        <div class="field">
          <label for="ax-title">На что потратил</label>
          <input class="input" id="ax-title" name="title" placeholder="Ужин, такси, билет..." required maxlength="60" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ax-amount">Сумма, ₽</label>
            <input class="input" id="ax-amount" name="amount" type="number" min="0" step="1" inputmode="numeric" placeholder="0" required />
          </div>
          <div class="field">
            <label for="ax-date">Дата</label>
            <input class="input" id="ax-date" type="date" name="date" value="${today}" />
          </div>
        </div>
        <div class="field">
          <label for="ax-cat">Категория</label>
          <select class="input" id="ax-cat" name="cat">${cats}</select>
        </div>
      </form>`;

    return sheetShell({
      title: 'Новая трата',
      body,
      foot: `<button class="btn block" type="submit" form="form-addexpense">Записать трату</button>`,
    });
  }

  /* ── меню «добавить» ─────────────────────────────────── */

  function menuItem(href, icon, title, sub) {
    return `
      <button class="menu-item" data-action="nav" data-href="${href}">
        <span class="mi-ico">${ico(icon)}</span>
        <span class="mi-text"><b>${title}</b><span>${sub}</span></span>
        ${ico('chevron')}
      </button>`;
  }

  function renderAddMenuSheet() {
    const body = `
      <div class="menu-list">
        ${menuItem('#/sheet/adddoc', 'ticket', 'Билет или бронь', 'Авиа, поезд, отель, страховка')}
        ${menuItem('#/sheet/addevent', 'calendar', 'Событие в план', 'Прогулка, ужин, экскурсия')}
        ${menuItem('#/sheet/addexpense', 'wallet', 'Трата', 'Записать расход в бюджет')}
        ${menuItem('#/sheet/newtrip', 'compass', 'Новая поездка', 'Добавить ещё одно путешествие')}
      </div>`;
    return sheetShell({ title: 'Что добавить', body });
  }

  /* ── карточка документа ──────────────────────────────── */

  function openDocSheet(id) {
    const trip = activeTrip();
    const doc = docsOf(trip).find((d) => d.id === id);
    if (!doc) {
      closeSheet(true);
      return;
    }
    const kind = KINDS[doc.kind] || KINDS.other;
    const m = doc.meta || {};
    const stateCls = doc.status === 'pending' ? 'pending' : doc.status === 'missing' ? 'missing' : '';

    let paper = '';
    if (doc.kind === 'flight' && m.from?.code) {
      paper = `
        <div class="doc-paper">
          <div class="ticket-head">
            <span class="ticket-head-left">${ico('plane')} ${esc(m.airline || 'Авиабилет')}</span>
            <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
          </div>
          <div class="ticket-route" style="margin-top:14px">
            <div class="ticket-end">
              <div class="ticket-code" style="font-size:34px">${esc(m.from.code)}</div>
              <div class="ticket-city" style="max-width:120px">${esc(m.from.city)} · ${esc(m.from.terminal || '')} · ${esc(m.from.time)}</div>
              <div class="ticket-city" style="color:var(--ink);font-family:var(--mono);font-weight:600;margin-top:4px">${dayMonth(m.from.date)}</div>
            </div>
            <div class="ticket-mid"><div class="ticket-plane-line">${ico('plane')}</div><div class="ticket-dur">${esc(m.duration || '')}</div></div>
            <div class="ticket-end" style="text-align:right">
              <div class="ticket-code" style="font-size:34px">${esc(m.to.code)}</div>
              <div class="ticket-city" style="max-width:120px;margin-left:auto">${esc(m.to.city)} · ${esc(m.to.terminal || '')} · ${esc(m.to.time)}</div>
              <div class="ticket-city" style="color:var(--ink);font-family:var(--mono);font-weight:600;margin-top:4px">${dayMonth(m.to.date)}</div>
            </div>
          </div>
          <div class="ticket-grid" style="margin-top:16px">
            <div class="ticket-cell"><span>Рейс</span><b>${esc(m.number || '—')}</b></div>
            <div class="ticket-cell"><span>Место</span><b>${esc(m.seat || '—')}</b></div>
            <div class="ticket-cell"><span>Гейт</span><b>${esc(m.gate || '—')}</b></div>
            <div class="ticket-cell"><span>Багаж</span><b>${esc(m.baggage || '—')}</b></div>
          </div>
          <div class="barcode"></div>
          <div class="barcode-code">${esc(m.pnr || '')}</div>
        </div>`;
    } else if (doc.kind === 'hotel') {
      paper = `
        <div class="doc-paper">
          <div class="ticket-head">
            <span class="ticket-head-left">${ico('bed')} Отель</span>
            <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
          </div>
          <div class="hotel-name" style="margin-top:14px">${esc(m.name || doc.title)}</div>
          <div class="hotel-addr">${esc(m.address || '')}</div>
          <div class="hotel-dates">
            <div class="hotel-date"><span>Заезд</span><b>${dayMonth(m.checkIn || doc.date)}</b></div>
            <div class="hotel-nights">${m.nights || 0} ${plural(m.nights || 0, ['ночь', 'ночи', 'ночей'])}</div>
            <div class="hotel-date" style="text-align:right"><span>Выезд</span><b>${dayMonth(m.checkOut || doc.date)}</b></div>
          </div>
          <div class="ticket-grid" style="margin-top:14px">
            <div class="ticket-cell"><span>Номер</span><b>${esc(m.room || '—')}</b></div>
            <div class="ticket-cell"><span>Бронь</span><b>${esc(m.booking || '—')}</b></div>
          </div>
          <div class="barcode"></div>
          <div class="barcode-code">${esc(m.booking || '')}</div>
        </div>`;
    } else {
      const rows = [];
      if (m.provider) rows.push(['Страховщик', m.provider]);
      if (m.policy) rows.push(['Полис', m.policy]);
      if (m.validTo) rows.push(['Действует до', dayMonthFull(m.validTo)]);
      if (m.sum) rows.push(['Покрытие', m.sum]);
      if (m.country) rows.push(['Страна', m.country]);
      if (m.operator) rows.push(['Перевозчик', m.operator]);
      if (m.place) rows.push(['Место', m.place]);
      if (m.address) rows.push(['Адрес', m.address]);
      if (doc.date) rows.push(['Дата', `${dayMonthFull(doc.date)}${doc.time ? ` · ${doc.time}` : ''}`]);
      if (m.code) rows.push(['Код', m.code]);

      paper = `
        <div class="doc-paper">
          <div class="ticket-head">
            <span class="ticket-head-left">${ico(kind.icon)} ${esc(kind.label)}</span>
            <span class="ticket-state ${stateCls}">${statusLabel(doc.status)}</span>
          </div>
          <div class="doc-generic-title" style="font-size:20px;margin-top:14px">${esc(doc.title)}</div>
          ${rows.length ? `<div class="detail-grid" style="margin-top:14px">${rows.map(([k, v]) => `<div class="detail-cell"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
          <div class="barcode"></div>
          <div class="barcode-code">${esc(m.code || m.policy || m.booking || 'GOOD TRIP')}</div>
        </div>`;
    }

    const note = m.note ? `<div class="detail-note">${esc(m.note)}</div>` : '';
    const phone = m.phone ? `<a class="btn ghost block" href="tel:${esc(m.phone.replace(/[^+\d]/g, ''))}">Позвонить ${esc(m.phone)}</a>` : '';
    const copyCode = m.pnr || m.booking || m.code || m.policy;
    const fix = doc.status !== 'ok'
      ? `<button class="btn block" data-action="doc-done" data-id="${esc(doc.id)}">Отметить как оформлено</button>`
      : '';

    const body = `
      ${paper}
      ${note}
      <div class="sheet-actions">
        ${copyCode ? `<button class="btn block" data-action="copy" data-copy="${esc(copyCode)}">${ico('copy')} Скопировать код</button>` : ''}
        ${phone}
        ${fix}
        <button class="btn ghost block" data-action="delete-doc" data-id="${esc(doc.id)}" style="color:#ff9b86">Удалить документ</button>
      </div>`;

    openSheet(sheetShell({ title: kind.label, body }));
  }

  /* ── обработка действий ──────────────────────────────── */

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toast(text) {
    const root = $('#toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function switchTrip(id) {
    if (!state.db.trips.some((t) => t.id === id)) return;
    state.db.activeTripId = id;
    state.planDay = null;
    state.docFilter = 'all';
    state.packTab = 'list';
    saveDB();
    haptic('light');
    closeSheet(true);
    state.tab = 'overview';
    navigate('#/overview');
    render();
    toast(`Открыта поездка «${activeTrip().title}»`);
  }

  function deleteDoc(id) {
    const trip = activeTrip();
    const doc = docsOf(trip).find((d) => d.id === id);
    if (!doc) return;
    if (!window.confirm(`Удалить «${doc.title}»?`)) return;
    trip.documents = docsOf(trip).filter((d) => d.id !== id);
    trip.events = (trip.events || []).map((e) => (e.docId === id ? { ...e, docId: '' } : e));
    saveDB();
    closeSheet();
    render();
    toast('Документ удалён');
  }

  function markDocDone(id) {
    const trip = activeTrip();
    const doc = docsOf(trip).find((d) => d.id === id);
    if (!doc) return;
    doc.status = 'ok';
    saveDB();
    closeSheet();
    render();
    toast('Отмечено как оформлено');
  }

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `travelator-${todayYMD()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Файл с данными скачан');
    } catch {
      toast('Не получилось скачать файл');
    }
  }

  function resetDemo() {
    if (!window.confirm('Сбросить демо-данные? Все изменения пропадут.')) return;
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem('travelator.seen');
    } catch {}
    location.hash = '#/overview';
    location.reload();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'nav') {
      e.preventDefault();
      haptic();
      navigate(el.dataset.href);
      return;
    }

    if (action === 'open-doc') {
      haptic();
      navigate(`#/sheet/doc/${el.dataset.id}`);
      return;
    }

    if (action === 'close-sheet') {
      haptic('light');
      closeSheet();
      return;
    }

    if (action === 'trips') {
      haptic();
      navigate('#/sheet/trips');
      return;
    }

    if (action === 'switch-trip') {
      switchTrip(el.dataset.id);
      return;
    }

    if (action === 'export') {
      exportData();
      return;
    }

    if (action === 'reset-demo') {
      resetDemo();
      return;
    }

    if (action === 'toggle-pack') {
      const trip = activeTrip();
      const item = (trip.packing || []).find((p) => p.id === el.dataset.id);
      if (!item) return;
      item.checked = !item.checked;
      saveDB();
      haptic(item.checked ? 'light' : 'soft');
      const y = window.scrollY;
      render(false);
      window.scrollTo({ top: y });
      return;
    }

    if (action === 'copy') {
      copyText(el.dataset.copy || '').then((ok) => toast(ok ? 'Код скопирован' : 'Не получилось скопировать'));
      return;
    }

    if (action === 'delete-doc') {
      deleteDoc(el.dataset.id);
      return;
    }

    if (action === 'doc-done') {
      markDocDone(el.dataset.id);
      return;
    }

    if (action === 'addmenu') {
      haptic();
      navigate('#/sheet/addmenu');
      return;
    }
  });

  /* ── формы ───────────────────────────────────────────── */

  document.addEventListener('change', (e) => {
    const radio = e.target.closest('.kind-opt input');
    if (!radio) return;
    $$('.kind-opt').forEach((l) => l.classList.toggle('is-active', l.querySelector('input') === radio));
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const type = form.dataset.form;
    const fd = new FormData(form);
    const trip = activeTrip();

    if (type === 'addpack') {
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const group = trip.packing.length ? trip.packing[trip.packing.length - 1].group : 'road';
      trip.packing.push({ id: uid('p'), group: group || 'road', name, checked: false });
      saveDB();
      form.reset();
      haptic('light');
      render(false);
      toast('Добавлено в список');
      return;
    }

    if (type === 'newtrip') {
      const city = String(fd.get('city') || '').trim();
      const country = String(fd.get('country') || '').trim();
      const start = String(fd.get('start') || '');
      const end = String(fd.get('end') || '');
      const tz = String(fd.get('tz') || 'Europe/Moscow');
      if (!city || !start || !end) return toast('Заполни город и даты');
      if (end < start) return toast('Дата возвращения раньше вылета');
      const tripNew = {
        id: uid('trip'),
        city,
        title: city,
        country,
        glyph: city.slice(0, 3).toUpperCase(),
        tz,
        gradient: 'g-sunset',
        start,
        end,
        companions: [],
        visaRequired: false,
        weather: null,
        budget: {
          total: 0,
          categories: [
            { id: 'flight', name: 'Перелёт', planned: 0 },
            { id: 'stay', name: 'Жильё', planned: 0 },
            { id: 'transport', name: 'Транспорт', planned: 0 },
            { id: 'food', name: 'Еда', planned: 0 },
            { id: 'fun', name: 'Активности', planned: 0 },
            { id: 'shopping', name: 'Покупки', planned: 0 },
            { id: 'misc', name: 'Прочее', planned: 0 },
          ],
        },
        documents: [],
        events: [],
        packing: [],
        expenses: [],
      };
      state.db.trips.unshift(tripNew);
      state.db.activeTripId = tripNew.id;
      state.planDay = null;
      state.docFilter = 'all';
      saveDB();
      haptic('medium');
      state.tab = 'overview';
      closeSheet(true);
      navigate('#/overview');
      render();
      toast(`Поездка «${city}» создана`);
      return;
    }

    if (type === 'adddoc') {
      const title = String(fd.get('title') || '').trim();
      if (!title) return toast('Напиши название');
      const kind = String(fd.get('kind') || 'other');
      const date = String(fd.get('date') || '') || todayYMD();
      const time = String(fd.get('time') || '');
      const place = String(fd.get('place') || '').trim();
      const code = String(fd.get('code') || '').trim();
      const status = String(fd.get('status') || 'ok');
      const meta = {};
      if (place) meta.place = place;
      if (code) meta.code = code;
      if (kind === 'hotel') meta.name = title;
      if (kind === 'insurance') meta.provider = title;
      if (kind === 'visa') meta.country = title;
      trip.documents.push({ id: uid('doc'), kind, status, title, date, time, meta });
      saveDB();
      haptic('medium');
      state.docFilter = 'all';
      closeSheet(true);
      navigate('#/docs');
      render();
      toast('Документ добавлен');
      return;
    }

    if (type === 'addevent') {
      const title = String(fd.get('title') || '').trim();
      if (!title) return toast('Напиши, что происходит');
      const day = String(fd.get('day') || trip.start);
      const time = String(fd.get('time') || '10:00');
      const kind = String(fd.get('kind') || 'walk');
      const sub = String(fd.get('sub') || '').trim();
      trip.events.push({ id: uid('ev'), day, time, kind, title, sub, docId: '' });
      saveDB();
      haptic('medium');
      const days = planDays(trip);
      const idx = Math.max(0, days.indexOf(day));
      state.planDay = idx;
      closeSheet(true);
      navigate(`#/plan/${idx}`);
      render();
      toast('Событие добавлено в план');
      return;
    }

    if (type === 'addexpense') {
      const title = String(fd.get('title') || '').trim();
      const amount = Number(fd.get('amount') || 0);
      if (!title || !(amount > 0)) return toast('Заполни название и сумму');
      trip.expenses.push({
        id: uid('x'),
        cat: String(fd.get('cat') || 'misc'),
        title,
        amount,
        date: String(fd.get('date') || todayYMD()),
      });
      saveDB();
      haptic('medium');
      closeSheet(true);
      state.packTab = 'budget';
      navigate('#/packing/budget');
      render();
      toast('Трата записана');
      return;
    }
  });

  /* ── запуск ──────────────────────────────────────────── */

  function init() {
    let db = loadDB();
    if (!db) {
      db = seedDB();
      state.db = db;
      saveDB();
    } else {
      state.db = db;
    }
    if (!state.db.trips.some((t) => t.id === state.db.activeTripId)) {
      state.db.activeTripId = state.db.trips[0]?.id;
      saveDB();
    }

    bootTelegram();

    applyRoute();

    window.addEventListener('hashchange', applyRoute);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.sheet) closeSheet();
    });

    setInterval(tick, 20000);

    try {
      if (!localStorage.getItem('travelator.seen')) {
        localStorage.setItem('travelator.seen', '1');
        setTimeout(() => toast('Это демо-поездка в Токио — всё можно менять'), 700);
      }
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
