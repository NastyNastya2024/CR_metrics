/* Демо-данные дашборда метрик рефинансирования.
   Базовые значения — за 30 дней. Все числа условные и согласованы между собой:
   воронка → партнёры → реестр расчётов → атрибуция. В продукте приходят из DWH (витрина refi_*). */
window.METRICS = {
  asOf: "20.10.2026",
  partners: [
    // share: доля запросов; appr: доля одобрений; p95: время ответа, с; na: доля «нет ответа»;
    // conv: переход → выдача; avg: средняя сумма, ₽; rate: средняя ставка одобрения, %; cpa: вознаграждение, % от суммы;
    // leak: выдачи без нашей ссылки у клиентов, смотревших предложение банка ≤30 дней; pre: есть предодобрения в пилоте
    { id: "sovcom", name: "Совкомбанк",  color: "#E6371F", share: 0.22, appr: 0.71, p95: 38,  na: 0.02, conv: 0.39, avg: 1180000, rate: 15.2, cpa: 1.6, leak: 0.11, pre: true },
    { id: "sber",   name: "СберБанк",    color: "#21A038", share: 0.24, appr: 0.58, p95: 52,  na: 0.03, conv: 0.41, avg: 1020000, rate: 16.1, cpa: 1.2, leak: 0.27, pre: true },
    { id: "gpb",    name: "Газпромбанк", color: "#1A4B9C", share: 0.14, appr: 0.52, p95: 74,  na: 0.06, conv: 0.33, avg: 940000,  rate: 16.6, cpa: 1.5, leak: 0.09, pre: false },
    { id: "vtb",    name: "ВТБ",         color: "#0A2896", share: 0.16, appr: 0.44, p95: 118, na: 0.09, conv: 0.30, avg: 1110000, rate: 17.3, cpa: 1.4, leak: 0.21, pre: false },
    { id: "alfa",   name: "Альфа-Банк",  color: "#EF3124", share: 0.12, appr: 0.49, p95: 46,  na: 0.04, conv: 0.36, avg: 860000,  rate: 18.0, cpa: 1.5, leak: 0.18, pre: true },
    { id: "tbank",  name: "Т-Банк",      color: "#2B2D33", share: 0.12, appr: 0.55, p95: 29,  na: 0.01, conv: 0.35, avg: 790000,  rate: 18.9, cpa: 1.7, leak: 0.14, pre: false }
  ],
  // Воронка онлайн-режима (API), 30 дней
  funnelApi: [
    { id: "mau",      name: "Активные пользователи ЛК",            v: 1240000, src: "metrics / logapi_db" },
    { id: "shown",    name: "Увидели блок экономии",                v: 312000,  src: "событие refi_savings_shown" },
    { id: "engaged",  name: "Изменили цель, кредиты или срок",      v: 96000,   src: "refi_goal/loans/term_changed" },
    { id: "started",  name: "Начали запрос (шаг «Проверка»)",       v: 41000,   src: "refi_check_opened" },
    { id: "sent",     name: "Отправили запрос в банки",             v: 33500,   src: "refi_request_sent" },
    { id: "approved", name: "Получили хотя бы одно одобрение",      v: 21800,   src: "refi_bank_answered (approved)" },
    { id: "selected", name: "Выбрали банк",                         v: 15300,   src: "refi_offer_selected" },
    { id: "redirect", name: "Перешли на сайт банка",                v: 14100,   src: "refi_redirected (lead_id)" },
    { id: "issued",   name: "Выдача подтверждена по КИ",            v: 4950,    src: "сверка lead ↔ eventsapi" },
    { id: "closed",   name: "Старые кредиты закрыты",               v: 4300,    src: "сверка закрытия по КИ" }
  ],
  // Воронка пилота на реестрах: банки присылают реестры предодобрений, онлайн-запросов нет
  funnelPilot: [
    { id: "registry", name: "Клиентов в реестрах предодобрений",   v: 180000,  src: "реестры банков (S3/CEPH)" },
    { id: "matched",  name: "Найдены в ЛК Кредистории",             v: 118000,  src: "сопоставление с b2c_users_db" },
    { id: "shown",    name: "Увидели предодобрение",                v: 96000,   src: "refi_preapproval_shown" },
    { id: "clicked",  name: "Нажали «Запросить условия»",           v: 18000,   src: "refi_preapproval_click" },
    { id: "redirect", name: "Перешли на сайт банка",                v: 12000,   src: "refi_redirected (lead_id)" },
    { id: "issued",   name: "Выдача подтверждена по КИ",            v: 3100,    src: "сверка lead ↔ eventsapi" },
    { id: "closed",   name: "Старые кредиты закрыты",               v: 2650,    src: "сверка закрытия по КИ" }
  ],
  value: { payDiff: 21400, intDiff: 64000, pdnBefore: 47, pdnAfter: 36, goalsMet: 0.81, avgRateBefore: 23.1 },
  marketRate: 17.5,
  survey: { shown: 6200, answered: 2380, found: 0.38, compared: 0.27, none: 0.35, chApp: 0.52, chCall: 0.31, chOffice: 0.17 },
  // Обращения в поддержку по шагам пути (категории из аналитики IMSB2C-1978), базовый квартал до запуска = 100%
  tickets: [
    { c: "C02", name: "Анкета: старые паспорт/телефон", base: 36, now: 9 },
    { c: "C03", name: "Анкета: поля не проходят",       base: 19, now: 11 },
    { c: "C07", name: "Нерелевантная выдача / ошибка",  base: 17, now: 6 },
    { c: "C04", name: "Статус и ответ банка",           base: 8,  now: 3 },
    { c: "C05", name: "Одобрено — что дальше",          base: 11, now: 2 },
    { c: "C06", name: "Отменить заявку / стоп займам",  base: 15, now: 7 }
  ],
  registryLoads: [
    { date: "20.10.2026 06:10", bank: "Совкомбанк", file: "sovcom_preapproved_20261020.csv", rows: 61240, errors: 112, status: "ok" },
    { date: "20.10.2026 05:40", bank: "СберБанк",   file: "sber_pa_20261020.xlsx",           rows: 74880, errors: 0,   status: "ok" },
    { date: "19.10.2026 23:55", bank: "Альфа-Банк", file: "alfa_refi_offers_1019.csv",       rows: 43920, errors: 2210, status: "warn" },
    { date: "18.10.2026 07:02", bank: "Совкомбанк", file: "sovcom_preapproved_20261018.csv", rows: 60110, errors: 98,  status: "ok" }
  ]
};
