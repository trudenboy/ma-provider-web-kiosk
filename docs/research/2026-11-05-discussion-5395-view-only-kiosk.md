# Discussion #5395: view-only Party → что доработать в Web Kiosk

> Реализовано в 1.2.0: R1 (display-only `/view`), R2 (read-only queue push),
> R3 (iframe allowlist) и R4 (profiles, fullscreen lock, PWA). R5–R10 остаются
> рекомендациями на будущее.

Исследовано 2026-11-05. Прочитан тред
[Party mode — View only (#5395)](https://github.com/orgs/music-assistant/discussions/5395),
включая комментарий
[karlcambre](https://github.com/orgs/music-assistant/discussions/5395#discussioncomment-18919870)
и ответ автора провайдера, связанные обсуждения
[#5181](https://github.com/orgs/music-assistant/discussions/5181),
[#5393](https://github.com/orgs/music-assistant/discussions/5393),
[#5228](https://github.com/orgs/music-assistant/discussions/5228),
upstream PR
[music-assistant/server#6948](https://github.com/music-assistant/server/pull/6948),
код провайдера 1.1.3 и Party-провайдер в локальном checkout
`music-assistant/server` от 2026-10-16. Код провайдера в рамках этого
исследования не менялся.

## 1. Короткий вывод

Тред начинался не как запрос нового плеера, а как запрос **view-only экрана
Party без логина**: лирика, очередь, QR, без бокового меню и навигации, в
iframe Home Assistant, на TV/старом WebView, с автоматизацией запуска.
Комментарий karlcambre добавляет второй слой — **операционные требования
площадки**: очередь для гостей, серверный rate limit, approval queue, имя
гостя и фильтр слов, staff on/off, караоке-лирика и объявления поверх музыки.

Web Kiosk уже закрывает большую часть первого слоя: страница работает без
фронтенда MA, метаданные, лирика и Party QR не требуют MA-токена, есть
TV-пульт, `lite`, `wake_lock` и цель совместимости с Chromium 53. Но остаются
три реальных блокера:

1. **Очередь требует MA-токен.** `queue=1` без токена просто не работает
   (`web.js:1045`), а токен в URL — это credential, который нельзя показывать
   гостям на TV.
2. **Страницы запрещено встраивать в iframe.** `X-Frame-Options: DENY` и
   `frame-ancestors 'none'` (`http_server.py:363`) прямо противоречат
   сценарию «карточка Party в Lovelace» из начала треда.
3. **Каждый экран регистрируется как плеер.** Открытие `/kiosk` всегда
   создаёт `WebKioskPlayer`; отдельного «только показывать» режима нет.
   Поэтому TV/панель становится ещё одним аудиовыходом, хотя часто должна
   лишь отображать состояние другого плеера.

Плюс два небольших, но заметных в треде пробела: **fullscreen-lock** (сейчас
есть только кнопка, после reload состояние теряется) и **PWA/профили** для
автоматизации.

Функции jukebox из комментария karlcambre **не надо переносить в провайдер**.
Часть уже есть в Party (guest access, лимиты add/boost/skip, karaoke, скрытие
кнопки «назад», прогресс, защита от дублей), часть отсутствует и является
upstream-задачей Party, а не плеера: серверный rate limit, approval queue,
имя гостя и фильтр слов, объявления с именем на TV. Провайдер должен
**показывать** состояние Party и очереди, а не строить второй jukebox: иначе
появятся два источника истины, а upstream-ревью увидит ещё больше scope creep.

Главная рекомендация: сделать **display-only режим** (экран подписывается на
состояние выбранного плеера, не регистрируется и не требует MA-токена) и
**read-only очередь через уже существующий push-канал**. Это одновременно
закрывает тред, снимает риск утечки токена на гостевой экран и даёт сильный
ответ на вопрос upstream «зачем нужен этот провайдер».

## 2. Что именно просит тред

| Участник | Запрос | Сценарий |
|---|---|---|
| QapaMcFly (OP) | Standalone view-only Party: без логина, меню, back и «exit fullscreen»; iframe в Lovelace; tokenized guest URL; `fullscreen_lock` | Домашний/гостевой экран, HA dashboard |
| bchevreau | iframe с прямым URL Party уже частично работает; fullscreen теряется после reload; нужен отдельный guest URL | Планшет/стена, Fully Kiosk |
| teek541 | В web dashboard виден sidebar; нужен standalone dashboard для cast/автоматизаций | TV/проектор |
| tbell19 | Автоматически выводить Party view на проектор через kiosk browser | Автоматизация |
| karlcambre | View-only по умолчанию; rate limit **на устройство, server-side**; approval queue; имя гостя + blocked words; staff on/off; live lyrics; объявления с именем гостя | Кафе/бар, реальная площадка |
| OzGav / 5181 | Cast Party UI на TV уже поддержан в MA 2.10+ | Chromecast/Android TV |
| OnFreund / 5393 | Лирика на TV без логина; Sendspin-плеер как источник, а не пользователь | Android TV + Sendspin |
| 5228 | QR как HA image entity; старый Fire HD 10 WebView 90 не тянет фронтенд MA | HA dashboard, старое железо |

Из этого получаются четыре разных сценария, которые в треде смешаны:

- **A. Standalone view-only экран** — без логина, меню и навигации; лирика,
  очередь, QR; fullscreen-lock. Это ядро исходного запроса.
- **B. Встраивание в HA dashboard** — iframe, старый WebView, отсутствие
  боковой панели; сюда же относится QR как image entity.
- **C. Площадка** — гости, очередь, заявки, лимиты, staff-режим, объявления.
  Это не про плеер, а про Party + отображение.
- **D. Автоматизация/cast** — открыть экран по расписанию, вывести на TV,
  не требовать клика/логина. Частично закрыто cast-поддержкой MA (5181
  закрыт как реализованный), частично требует kiosk browser/PWA.

## 3. Что Web Kiosk уже умеет

| Требование из треда | Сейчас | Где |
|---|---|---|
| Отдельная страница без фронтенда MA и без логина | Да, `/kiosk`; метаданные, лирика, визуализатор, Party QR не требуют MA-токена | `http_server.py:652`, README |
| Очередь без логина | **Нет**: `queue=1` требует токен, иначе `fetchQueue()` не вызывается | `web.js:1045`, README |
| Party QR | Да, но opt-in (`enable_party_qr=false`), QR содержит guest login | `party.py`, `strings.json` |
| Управление воспроизведением без логина | Нет, `rpc()` требует токен | `web.js:121` |
| Встраивание в iframe | **Нет**, `X-Frame-Options: DENY` + `frame-ancestors 'none'` | `http_server.py:363` |
| Fullscreen | Только кнопка при `fullscreen=1`; после reload её надо нажимать снова | `index.html:119`, `web.js` |
| TV-пульт, lite, wake lock | Да: `remote=1`, `lite=1`, `wake_lock=1` | README, `url-builder.js` |
| Старые браузеры | Цель — Chromium 53/ES2015 для страницы; Sendspin — Chromium 67+ | `BROWSER_COMPATIBILITY_AUDIT.md` |
| Объявления поверх музыки | Аудио проходит как обычный `play_media`; отдельного экрана/оверлея нет, title всегда «Announcement» | `provider.py`, `announcements.py` |
| Очередь как в Party: badge «гость»/«boost» | Нет, страница рисует только title/artist/image | `web.js` |
| Журнал заявок, approval, имена | Нет и не должно быть в плеере | — |

Отдельно важно: **очередь сейчас не просто требует токен, она ещё и
опрашивается через `/api` каждые 15 секунд** (`web.js:1587`) и тянет до 200
элементов. Для view-only экрана это лишний трафик, лишняя зависимость от
MA API и лишний повод держать credential на TV.

## 4. Что уже есть в MA/Party и что не надо дублировать

Проверено по локальному checkout `music-assistant/server` (2026-10-16) и
собранному frontend wheel:

- **Guest access, join codes, guest user, отзыв токенов** —
  `helpers/guest_access.py`, `providers/party`.
- **Настраиваемые лимиты add / boost / skip с refill** — конфиг Party
  (`add_queue_limit`, `boost_limit`, `skip_song_limit` и т.д.).
- **Karaoke mode, highlight ahead, anti burn-in, hide back button, progress
  bar, prevent duplicate tracks** — конфиг Party.
- **Staff on/off уже существует**: `enable_guest_access` в Party. Выключение
  отзывает guest-токены и отключает гостей; `party/url` начинает возвращать
  `None`, поэтому QR на киоске исчезает в течение ~10 секунд (кэш адаптера).
- **Cast Party UI на TV** — по словам мейнтейнера в 5181, уже поддержан в
  MA 2.10+; это закрывает часть сценария D, но не старые TV-браузеры.
- **QR как HA image entity** — в 5228 указан PR `home-assistant/core#176148`;
  это задача интеграции HA, а не провайдера. Провайдер может дать стабильный
  URL картинки, но не создать HA entity.

Чего в Party **нет** (и это upstream-задачи, а не провайдера):

- **Серверного rate limit.** В текущем checkout лимиты считает
  `PartyGuestView-*.js` в браузере (token bucket в localStorage); серверный
  `party/add_to_queue` проверяет только feature toggles. Гость может обойти
  лимит прямым вызовом API. Комментарий karlcambre про «enforced server-side»
  попадает в реальный пробел.
- **Approval queue** для треков вне библиотеки/плейлистов.
- **Имени гостя и blocked words** в `party/add_to_queue`.
- **Кастомного текста объявления**: core создаёт `PlayerMedia(title="Announcement")`,
  текст TTS в media не попадает.

Вывод: провайдеру не нужно реализовывать ни один из этих четырёх пунктов.
Ему нужно **отображать** состояние Party (QR, «заявки закрыты», badge
guest/boost, «Announcement») и дать гостям read-only очередь. Сами заявки,
лимиты и approval — это Party.

### Что предложить upstream (Party), а не провайдеру

1. **Server-side token bucket** для `party/add_to_queue`,
   `party/boost_queue_item`, `party/skip_current`: ключ — guest user +
   устройство/сессия (join code уже создаёт `device_name`), ответ с
   `remaining`/`retry_after`; `PartyConfig` отдаёт остаток, чтобы фронтенд и
   киоск показывали его, а не считали сами. Это закрывает обход лимита
   прямым API-вызовом.
2. **Approval queue**: `party/add_to_queue` возвращает `pending` для трека
   вне библиотеки/плейлистов; staff-команды `party/approve`,
   `party/reject`, `party/play_once`; гость видит статус. В киоске — badge
   «pending» в очереди, без отдельного UI заявок.
3. **Имя гостя и blocked words**: необязательный `guest_name` в
   `party/add_to_queue`, серверная проверка списка слов, запись в
   `QueueItem.extra_attributes`; киоск показывает «requested by …» через
   уже существующий queue push.
4. **Display metadata для объявлений**: `PlayerMedia.title`/`custom_data`
   с текстом объявления, чтобы киоск мог показать имя гостя; либо отдельная
   команда/поле, а не только `title="Announcement"`.

Это не блокирует Web Kiosk: п.1–3 можно показывать, когда появятся; п.4
можно закрыть staff-оверлеем (R6) уже сейчас.

## 5. Рекомендации

### P0. То, что прямо отвечает на тред

#### R1. Display-only режим: экран без регистрации плеера и без MA-токена

**Проблема.** Сейчас любой `/kiosk` — это плеер: `_handle_ws` вызывает
`_register_socket_player` (`http_server.py:696`, `:1317`), создаёт
`WebKioskPlayer`, и только потом показывает состояние. Для TV, второй панели
или HA dashboard это неверная модель: экран не должен быть аудиовыходом и не
должен получать MA-токен.

**Предложение.** Новый маршрут `/view` (алиас `/kiosk?display=1`) с
параметром `player=<player_id>`:

- страница не регистрирует плеер, не открывает `<audio>` и не грузит Sendspin;
- целевой плеер — **любой** MA player (WebKiosk, Sendspin output, колонка,
  группа), а не только kiosk: metadata/lyrics берутся из его
  `current_media`/queue item, очередь — из его active queue; если очереди нет,
  показывается только now playing. Это и есть сценарий «звук играет на
  колонке/TV-приложении, а экран показывает лирику и очередь»;
- существующие `media_timeline`, `corrected_elapsed_time` и lyrics-парсер
  переиспользуются; для не-WebKiosk плеера позиция берётся из его active
  queue, а лирика — из media item текущего queue item;
- подключается к `/ws?display=<player_id>`, сервер проверяет, что плеер
  существует, и добавляет сокет в отдельный `_display_clients`, а не в
  `_ws_clients`;
- сервер push-ит `welcome` (состояние, позиция, скорость, текущий item),
  `media`, `queue`, `lyrics`, `party`, `group`, `pause/resume/seek`;
- страница сама тикает прогресс от `start` + `playback_speed`, как это уже
  делает плеерная страница; на `pause`/`seek`/`media` пересинхронизируется;
- если плеер offline — «Player offline», периодический retry, без регистрации;
- несколько display-клиентов на одного плеера разрешены; они не влияют на
  idle timeout, `schedule_player_close` и счётчики `_ws_clients`;
- `party=1` вместо `player=...`: адаптер вызывает существующую команду
  `party/player`, находит очередь активной вечеринки и подписывает экран на
  её плеер. Это и есть буквальный ответ на «view-only Party»: гостевой экран
  не знает player_id и не требует токена. Если Party не установлен/не
  настроен — понятная ошибка, без регистрации плеера;
- URL builder получает режим «Display only» с выбором плеера (или «Party
  player») и кнопкой «Copy display URL»; в provider settings —
  `enable_display_mode` (default **false**, описание: «read-only screens for
  a player; anyone who can reach the kiosk port can view its current item and
  queue; trusted LAN only»).

**Почему без MA-токена.** View-only экран не должен нести credential. Это
главный аргумент: токен в URL на TV в кафе — это утечка, даже если он во
fragment. Данные для display (текущий трек, очередь, лирика, QR) и так
публичны в рамках доверенной LAN; отдельного токена не требуется. Если нужен
более строгий режим — позже добавить signed `view_token` (HMAC от
`player_id`, отдельный namespace, не переиспользовать stream token), но
начинать с provider-setting достаточно.

**Безопасность.** `enable_display_mode=false` по умолчанию; при включении
любой в LAN может смотреть очередь любого зарегистрированного плеера. Это
осознанный trade-off, его надо явно описать в README/known-issues. Не
добавлять в display-режим управление, поиск по библиотеке и `/api`.

**Acceptance criteria.**

- `/view?player=wk_x` не увеличивает число плееров в MA и не создаёт
  `WebKioskPlayer`.
- `/view?player=<обычная колонка или Sendspin output>` показывает now playing
  и очередь этого плеера; kiosk-плеер не регистрируется.
- Два display-клиента на одного плеера показывают одинаковое состояние;
  закрытие одного не влияет на плеер и второй экран.
- Очередь, лирика и QR обновляются без MA-токена и без вызовов `/api`.
- `enable_display_mode=false` → 404/403 на `/view` и display-WS.
- Тест: display-сокет не попадает в `_ws_clients`, не продлевает idle
  timeout и не вызывает `schedule_player_close`.

**Оценка:** 2–3 дня кода + тесты. Это самая ценная доработка для треда.

#### R2. Read-only очередь через push-канал

**Проблема.** Очередь — единственная view-функция, которой нужен MA-токен;
она опрашивается раз в 15 секунд и тянет полные `QueueItem` через `/api`.
Для гостевого экрана это плохо и по безопасности, и по нагрузке.

**Предложение.** Серверный snapshot очереди в WS:

- на connect и по событиям `QUEUE_ITEMS_UPDATED` / `QUEUE_UPDATED`
  (`mass.subscribe`, как это делает Sonos-провайдер) отправлять компактный
  `queue` message: `queue_item_id`, title, artist, duration, image_url,
  `is_current`, `party_guest`, `party_boosted`;
- брать `player_queues.items(queue_id, limit, offset)` вокруг текущего
  индекса, не больше 50–100 элементов; не сериализовать `media_item` целиком;
- для display-режима — всегда; для обычной страницы `queue=1` — при включённом
  `enable_display_mode`, иначе сохранить текущий token-путь (обратная
  совместимость);
- убрать `setInterval(fetchQueue, 15000)` и `player_queues/items` из
  `PAGE_API_COMMANDS`, когда push включён;
- добавить badge «guest»/«boost» из `extra_attributes`, чтобы киоск выглядел
  как Party-очередь;
- не отдавать библиотеку, поиск и полные объекты.

**Acceptance criteria.**

- Очередь появляется после reload без токена (при `enable_display_mode`).
- Добавление/перестановка/удаление элемента обновляет экран в пределах ~2 с.
- Очередь на 500 элементов не отправляет 500 объектов и не делает N+1
  запросов к провайдерам.
- Старый token-путь продолжает работать, если настройка выключена.
- Тесты на snapshot, limit, badges, событие reorder, отсутствие `/api`.

**Оценка:** 1–2 дня. Логично делать вместе с R1.

#### R3. Опциональное встраивание в iframe (HA dashboard)

**Проблема.** Сейчас iframe запрещён безусловно (`http_server.py:363`);
это прямо блокирует OP, bchevreau и 5228. README так и говорит: «security
headers block iframe embedding, including embedding in Home Assistant
dashboards».

**Предложение.** Provider setting `frame_ancestors` (SPLITTED_STRING,
`multi_value=True`), список точных origin'ов, например
`https://homeassistant.local:8123`. Разрешать встраивание **только для
display-страницы** (`/view` и `/kiosk?display=1`), а не для builder'а,
`/builder-auth` и плеерных страниц с controls: credential-страницы должны
остаться `DENY` при любом конфиге. Middleware:

- пусто → текущее поведение для всех страниц: `X-Frame-Options: DENY` +
  `Content-Security-Policy: frame-ancestors 'none'`;
- непусто → для `/view` (и `/kiosk` с `display=1`):
  `Content-Security-Policy: frame-ancestors <origin1> <origin2>`;
  `X-Frame-Options` **не отправлять** (он не умеет список и заблокирует
  cross-origin);
- для остальных страниц — всегда `DENY`, независимо от allowlist;
- валидировать: только `http(s)://host[:port]`, без path, без `*`, без
  `null`/`file:`/`javascript:`; ошибка конфига — warning и deny, не молчаливый
  allow;
- не добавлять `*` и не разрешать все origin'ы «на время».

**Почему это приемлемо.** CSP — browser-enforced allowlist; страница
по-прежнему не отдаёт MA-токен родителю (токен только во fragment и только
для controls). Для view-only iframe токен вообще не нужен (R1). Остаётся
clickjacking-риск, если разрешённый origin скомпрометирован; поэтому default
deny и явное предупреждение в настройке.

**HA-рецепт.** `webpage` card с `http://ma-host:8098/view?player=wk_tv`,
`allowfullscreen`, точный origin HA в `frame_ancestors`; для HA ingress —
origin внешнего URL HA, а не `hassio_ingress` path. Отдельно проверить, что
iframe не ломает localStorage/WS (Chrome partitioning, Safari ITP).

**Acceptance criteria.**

- Default: заголовки как сейчас, iframe не грузится.
- Allowlist: HA-страница грузится в iframe, чужой origin — нет.
- Нет wildcard; невалидный origin отклоняется.
- Тесты на заголовки для `/`, `/kiosk`, `/view`, статики.
- README/known-issues: как включить и чем рискуешь.

**Оценка:** 0.5–1 день + security review. Лучше отдельным PR после R1/R2:
это изменение границы безопасности, его не стоит смешивать с плеером.

#### R4. Профили киоска, fullscreen-lock и PWA

**Проблема.** В треде дважды всплывает fullscreen: кнопка не переживает
reload, а автоматизация не может «нажать» её. Плюс URL builder уже содержит
12 флагов, которые для типового сценария всегда одинаковы.

**Предложение.**

- `profile=player|tv|wall|guest` — пресеты:
  - `player`: текущий `/kiosk` (Sendspin/HTML5, controls off);
  - `tv`: `remote=1&lite=1&wake_lock=1&fullscreen=1&queue=1&lyrics=1`;
  - `wall`: `fullscreen=1&queue=1&lyrics=1&wake_lock=1&show_group=1`;
  - `guest`: view-only (`display`), `lyrics=1&party=1&queue=1`, без controls.
  Явные флаги переопределяют пресет.
- `lock=1`: скрыть кнопку выхода из fullscreen; пытаться войти в fullscreen
  на первом `pointerdown`/`keydown` (без жеста браузер не даст); не
  обещать, что Escape не сработает — это решает браузер/kiosk shell.
- `manifest.webmanifest` с `display: fullscreen`, `start_url` под профиль,
  иконками; PWA помогает на Android/desktop Chrome, но не на старом TV
  browser; для настоящего lock — Fully Kiosk/подобный shell.
- `wake_lock` и `remote` включены в пресетах; `show_stop_notification` не
  трогать.

**Acceptance criteria.**

- `?profile=wall` разворачивается в ожидаемые флаги; builder показывает
  итоговый URL.
- `lock=1` скрывает exit-кнопку; после первого жеста fullscreen входит;
  после reload — снова нужен жест (честно описано).
- PWA manifest валиден, иконки отдаются, `start_url` не теряет `device_id`.
- Тесты JS на пресеты и lock; ручная проверка на Android TV/планшете.

**Оценка:** ~1 день.

### P1. Площадка: показывать Party, не строить второй jukebox

#### R5. Состояние Party в киоске

**Проблема.** Staff on/off уже есть в Party (`enable_guest_access`), но киоск
просто прячет QR через ~10 секунд и ничего не объясняет. В очереди нет
badge «гость»/«boost», хотя `extra_attributes` это уже содержат.

**Предложение.**

- `PartyAdapter.get_active_party()` дополнительно возвращает
  `guest_access: bool`: если `party/config` доступен, а `party/url` вернул
  `None` — заявки выключены; если Party нет — `None`.
- `/api/party` отдаёт `{active, guest_access, name, qr_text, version}`;
  страница показывает «Guest requests are paused» вместо тихого исчезновения
  QR.
- В `queue` message (R2) прокинуть `party_guest`/`party_boosted`; страница
  рисует badge. Если Party позже добавит `guest_name` в
  `QueueItem.extra_attributes`, badge станет «requested by …» без изменений
  в провайдере.
- Стабильный `/api/party/qr.png` (уже есть) задокументировать как картинку
  для HA `picture`/`generic` camera; напомнить, что QR — guest login и его
  нельзя публиковать наружу.

**Не делать:** не добавлять в провайдер `party/add_to_queue`, лимиты,
approval, имена и blocked words. Это Party.

**Acceptance criteria.**

- Выключение guest access в Party → QR исчезает, появляется «paused» в
  пределах 10 с, очередь/лирика продолжают работать.
- Badge guest/boost отображаются и не ломают layout.
- Нет новых вызовов Party API на каждый рендер (кэш 10 с сохраняется).

**Оценка:** ~1 день.

#### R6. Оверлей объявления и staff-сообщение

**Проблема.** Объявления уже играют (аудио), но на экране нет отдельного
состояния: core отдаёт `title="Announcement"`, имя гостя в media не
попадает. karlcambre хочет «birthday song + имя на TV».

**Предложение.**

- В `play`/`media` message добавить `media_type`; страница при
  `MediaType.ANNOUNCEMENT` показывает крупный оверлей «Announcement»,
  временно скрывает лирику/очередь и восстанавливает их после IDLE.
- Опционально — API-команда провайдера `web_kiosk/show_message`
  (`Scope.PLAYERS_CONTROL`) с `player_id`, `text`, `duration`, `image_url`;
  страница показывает текст N секунд. Регистрировать в `loaded_in_mass`,
  снимать в `unload`; без неё имя гостя на TV не показать.
- Триггер объявления остаётся в core/HA (`players/cmd/play_announcement`);
  провайдер только отображает.
- Не давать эту команду гостям; только MA-пользователь с правом управления
  плеером.

**Acceptance criteria.**

- Announcement → оверлей, после окончания — прежний экран, очередь не
  сдвинулась.
- `show_message` показывает текст ровно N секунд, перекрывается следующим
  сообщением, не блокирует playback.
- Без scope команда отклоняется; тест на регистрацию/снятие команды.

**Оценка:** 1–2 дня.

#### R7. Караоке-лирика на весь экран

**Проблема.** Лирика есть, но это 3 строки снизу/сбоку; на TV хочется
«sing along» как в Party karaoke.

**Предложение.** `lyrics=full`:
- скрыть артворк/очередь/QR, крупные 5 строк по центру, текущая строка
  подсвечена, следующая — приглушена;
- анти-burn-in сдвиг на несколько пикселей раз в N минут (опционально);
- тайминги — существующий LRC-парсер, без новых зависимостей;
- `profile=tv` включает `lyrics=full`.

**Acceptance criteria.**

- TV-разрешение: 5 строк читаемы с 3 м; синхронизация с LRC; инструментал
  не мигает; анти-burn-in не заметен.
- `lyrics=full` не ломает `lyrics=1` и `lite`.

**Оценка:** ~1 день.

### P2. Продукт и upstream

#### R8. Сертификация старых браузеров

Проверить на реальном Fire HD 10 (WebView 90) и Android TV:
`/view` без логина, очередь, лирика, QR, `lite=1`, `remote=1`. Обновить
`BROWSER_COMPATIBILITY_AUDIT.md` и known-issues таблицей «устройство →
режим → результат». Это сильный аргумент в PR: старый WebView, который не
тянет фронтенд MA, тянет kiosk-страницу.

#### R9. Позиционирование upstream PR

Главный вопрос MarvinSchenkel в #6948 — «зачем нужен провайдер, если есть
Sendspin web player и dashboard». Ответ должен стать короче и конкретнее:

- no-login view-only экран для гостей/ТВ, который не является плеером;
- старые браузеры/WebView, где фронтенд MA не работает;
- TV-пульт и полноэкранный режим без фронтенда;
- несколько экранов на один плеер в площадке.

Практические шаги:

- не растить 12k-строчный PR бесконечно: R1+R2 — в текущий PR (это и есть
  ответ на «зачем»), R3 — отдельным PR после merge (security), R4–R7 —
  follow-up'ы;
- обновить описание PR матрицей «Sendspin web player / Party dashboard /
  Web Kiosk» и коротким demo-видео сценария кафе;
- #44 (cross-provider `add_identifier`) — либо дождаться provider-neutral
  API, либо явно оставить документированное исключение на решение
  мейнтейнера; не расширять его;
- `PartyAdapter` читает `mass.command_handlers` (`party/url`, `party/config`,
  `party/player`) — это такое же cross-plugin coupling, как #44, и ревьюер
  может поднять его отдельно. Пока публичного internal-call API нет,
  зафиксировать это как документированное исключение с проверкой наличия
  команд и предложить core-API «party status» для провайдеров;
- ответ в треде — только human-written (AI Policy), без обещаний дат.

**Стратегическая развилка.** Тред просит, по сути, view-only режим Party.
Варианты:

| Вариант | Плюсы | Минусы |
|---|---|---|
| A. Display mode в Web Kiosk (рекомендую сейчас) | Быстро, работает на старых TV/WebView, без фронтенда MA, в зоне контроля провайдера | Дублирует часть будущей core-функции; ещё один экран в provider scope |
| B. View-only route в Party/frontend (upstream) | Один источник истины, benefits всем, не растит провайдер | Медленно, требует frontend PR, старые браузеры всё равно не потянет |
| C. A + B параллельно | Провайдер закрывает старые устройства и площадку, core — общий путь | Больше координации и коммуникации |

Рекомендую A сейчас, B — отдельным человеческим feature request в Party,
C — долгосрочно. В ответе в треде это надо сказать явно: провайдер не
пытается заменить Party, он даёт экран там, где фронтенд MA не работает.

#### R10. Документация и рецепты

Добавить страницы:

- «Café/bar»: один аудиоплеер + N TV в `/view`, Party guest access, QR,
  staff toggle, объявления;
- «HA dashboard»: `frame_ancestors`, `webpage` card, ограничения iframe;
- «Automation»: Fully Kiosk/Android TV, `device_id`, `wake_lock`,
  `profile=wall`, почему autoplay/fullscreen требуют жеста;
- «Security»: kiosk-порт без логина, что такое display mode, почему токен
  нельзя на TV, QR — guest login.

## 6. Чего не делать

1. **Не строить jukebox в провайдере.** Rate limit, approval queue, имена,
   blocked words, «заявки» — это Party. Дублирование даст два источника
   истины, усложнит upstream и нарушит изоляцию провайдеров.
2. **Не добавлять общий MA API proxy для гостей.** View-данные идут push'ем;
   `/api` остаётся только для controls с токеном.
3. **Не класть MA-токен в гостевой/display URL.** Для view-only он не нужен;
   для controls — только на доверенном устройстве.
4. **Не разрешать `frame-ancestors *`.** Только точные origin'ы, default deny.
5. **Не обещать Chromecast.** Браузер на Cast не работает; 5181 закрыт
   cast-поддержкой MA; для старых TV — browser/kiosk shell, не Cast.
6. **Не дублировать очередь.** Читать `player_queues` и пушить компактный
   snapshot; не пересчитывать порядок, repeat, crossfade.
7. **Не пытаться программно обойти fullscreen/autoplay gesture.** Это
   ограничение браузера; честно документировать kiosk shell/PWA.
8. **Не выдавать на TV админский MA-токен.** Для view-only он не нужен
   (display mode); для controls — отдельный MA-пользователь с минимальной
   ролью и только там, где управление действительно нужно.

## 7. План внедрения

| Этап | Что | Спека | Оценка | Результат |
|---|---|---|---|---|
| 1 | R1 display-only + R2 queue push | `0010-display-mode` | 3–4 дня | Тред закрыт по основной функции; TV/HA не требуют токена |
| 2 | R3 iframe allowlist | `0011-frame-ancestors` | 1 день + review | Lovelace/HA dashboard |
| 3 | R4 профили/fullscreen/PWA + R5 Party state | `0012-kiosk-profiles` | 2 дня | Автоматизация, staff toggle, badges |
| 4 | R6 announcement overlay + R7 karaoke | `0013-venue-display` | 2–3 дня | Площадка |
| 5 | R8–R10 | — | 1–2 дня | Сертификация, upstream, docs |

Правила repo: WIP = 1 спека; `feat:` PR требует спеку; changelog — канонические
`### Added/Changed/Fixed`, без внутренних путей; `VERSION` не бампать;
`pre-commit run --all-files`, `pytest`, `ruff`, `mypy`; тесты display-режима
не должны создавать новых владельцев задач (использовать `_post`/`_own` и
существующие сокетные задачи), lock order — `_outbound_lock(player_id)`.

## 8. Тезисы для ответа в треде

Ответ должен быть написан человеком (AI Policy), это только тезисы:

- Спасибо за детальный разбор площадки; проверил сценарии против Web Kiosk.
- Уже сегодня без MA-логина работают метаданные, лирика и Party QR;
  очередь и управление требуют токен — это как раз то, что меняю.
- Следующие шаги: display-only экран без регистрации плеера и без токена,
  read-only очередь, опциональный iframe для HA dashboard, fullscreen-lock.
- Rate limit/approval/имя гостя — это Party, а не плеер; в Party уже есть
  лимиты, boost, skip и karaoke, но лимиты сейчас считаются на клиенте.
  Предложу upstream-issue на серверный rate limit, approval и имя гостя;
  киоск покажет статус и badges, когда это появится.
- Могу дать тестовую сборку/URL и попросить проверить на вашем железе;
  какие пункты обязательны, а какие nice-to-have?

## 9. Открытые вопросы к мейнтейнеру

1. Display mode — отдельный `/view` или флаг `/kiosk?display=1`? Рекомендую
   `/view` как канонический, флаг — алиас.
2. `enable_display_mode` по умолчанию **off**? Рекомендую off: очередь —
   это данные библиотеки, пусть будет осознанное включение.
3. iframe — делать в провайдере или ждать core view-only? Рекомендую
   провайдерный allowlist сейчас, core-путь — параллельно.
4. Approval/name filter — только upstream Party? Рекомендую да, иначе
   провайдер превращается в jukebox.
5. Можно ли добавлять R1/R2 в текущий upstream PR, или PR заморожен по
   размеру? Рекомендую добавить: это и есть ответ на «зачем».
6. Какие устройства обязательны для сертификации: Fire HD 10, Android TV,
   Raspberry Pi, iPad?

## 10. Источники

- [Discussion #5395](https://github.com/orgs/music-assistant/discussions/5395)
- [Комментарий karlcambre](https://github.com/orgs/music-assistant/discussions/5395#discussioncomment-18919870)
- [Discussion #5181](https://github.com/orgs/music-assistant/discussions/5181),
  [#5393](https://github.com/orgs/music-assistant/discussions/5393),
  [#5228](https://github.com/orgs/music-assistant/discussions/5228)
- [upstream PR #6948](https://github.com/music-assistant/server/pull/6948)
- Код провайдера: `provider/http_server.py`, `provider/provider.py`,
  `provider/player.py`, `provider/party.py`, `provider/static/web/web.js`,
  `provider/static/web/index.html`, `provider/static/web/url-builder.js`
- Party: `music_assistant/providers/party/__init__.py`,
  `music_assistant/helpers/guest_access.py`,
  frontend `PartyGuestView-*.js`
- HA image entity: `home-assistant/core#176148` (из 5228)
