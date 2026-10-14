# Аудит совместимости Web Kiosk с браузерами

Дата: 2026-10-14. Проверен код PR #36, commit `b0f05e0de854630b2bf50f9580b968314757fd36`, включая увеличение QR. SDK: `@sendspin/sendspin-js` 5.0.0, bundle target ES2022.

## Вывод

### Статус реализации после аудита

Рекомендации реализованы по четырём этапам в [PR #36](https://github.com/trudenboy/ma-provider-web-kiosk/pull/36): независимый classic HTML5 и запасная вёрстка; touch/remote управление; проверка кодеков и единый storage; возврат страницы/сети, облегчённый режим и необязательный wake lock. Исходные выводы ниже относятся к commit `b0f05e0` до этих исправлений.

Обязательные player/builder скрипты проходят ES2015 parser; SDK отдельно собран для Chromium 67/Safari 15/Firefox 68 и загружается через classic script. При отсутствии требуемых возможностей выбирается HTML5. Необязательные параметры `remote=1`, `lite=1`, `wake_lock=1` добавлены в конструктор. Для HTTPS нужен настроенный HTTPS/WSS endpoint; для TV-пульта события должны доходить до страницы.

Проверки имитации API и синтаксиса не заменяют испытания аппаратного декодера, пульта, WebView, сна и длительной работы на реальных устройствах. Изменения включены в версию провайдера 1.0.13.

Текущая реализация ориентирована на современные браузеры. Для широкого охвата Smart TV и фиксированных Android kiosk-панелей нужны совместимая базовая вёрстка и независимый HTML5 MP3 режим. Требования Sendspin выше: его нельзя обещать всем устройствам, способным воспроизводить MP3.

По используемым CSS-возможностям современный уровень — Chromium 105+, Firefox 121+, Safari 15.4+. Это ориентир по API, а не сертификат работы звука, пульта или длительного воспроизведения на соответствующем устройстве.

Аудит включает чтение исходников, проверку официальной документации и несколько диагностических запусков существующего Node VM стенда. Реальные старые браузеры и телевизоры не запускались. Пользователь подтвердил внешний вид текущего стенда; это не проверка всех платформ.

## Движки Smart TV

| Год / платформа | Samsung TV / Tizen | LG webOS TV | Оценка текущего кода |
|---|---|---|---|
| 2026 | Tizen 10, Chromium 130 | webOS 26, Chromium 132 | Современные CSS/API; требуется проверка конкретного аудиотракта и пульта |
| 2025 | Tizen 9, Chromium 120 | webOS 25, Chromium 120 | Аналогично; некоторые эффекты зависят от реализации TV-порта |
| 2024 | Tizen 8, Chromium 108 | webOS 24, Chromium 108 | Основные используемые CSS доступны; звук ещё не проверен |
| 2023 | Tizen 7, Chromium 94 | webOS 23, Chromium 94 | Нет `:has()`: QR остаётся маленьким, условная компоновка не включается |
| 2022 | Tizen 6.5, Chromium 85 | webOS 22, Chromium 87 | Samsung: нет `replaceChildren`/`inset`; у обеих нет `aspect-ratio` и `:has()` |
| 2021 | Tizen 6, Chromium 76 | webOS 6, Chromium 79 | Помимо CSS, bundle SDK использует неподдерживаемый optional chaining |
| 2020 | Tizen 5.5, Chromium 69 | webOS 5, Chromium 68 | Несколько отсутствующих CSS/DOM возможностей; SDK синтаксически несовместим без преобразования |
| 2019 | Tizen 5, Chromium 63 | webOS 4, Chromium 53 | Samsung: Sendspin требует отсутствующего BigInt; LG: основной JS содержит неподдерживаемые async/import |
| 2018 | Tizen 4, Chromium 56 | webOS 4, Chromium 53 | Основной JS не проходит требуемый уровень синтаксиса |
| 2017 и старше | Chromium 47 или старый WebKit | Chromium 38 и старше | Нужен отдельный упрощённый профиль; текущую поддержку не обещать |

Источники: [Samsung Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html), [LG Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).

Версия движка из таблицы производителя не гарантирует все desktop API в TV-порту. После обновления платформы важен фактический User-Agent/движок устройства.

## Вёрстка: конкретные ограничения

| Возможность | Chromium | Safari | Использование и последствия |
|---|---|---|---|
| `:has()` | 105+ | 15.4+ | Увеличение QR, мобильная перестановка элементов, удержание видимости панели, отступ от очереди. Без поддержки эти правила полностью игнорируются |
| `aspect-ratio` | 88+ | 15+ | Большая обложка имеет `height:auto`, изображение — absolute. Нет запасной высоты: возможна нулевая высота контейнера |
| `inset` | 87+ | 14.1+ | Позиционирование Kiosk, фона, панели, QR. Нет независимых `top/right/bottom/left` fallback |
| `min()` / `clamp()` | 79+ | 11.1+ / 13.1+ | Размеры обложки, текста, очереди. При игнорировании деклараций запасные размеры не заданы |
| `env()` | 69+ | 11.1+ | Высота и положение панели с safe area. Неподдерживаемая функция делает использующую её декларацию недействительной |
| flex `gap` | 84+ | 14.1+ | Отступы между обложкой, текстом и кнопками исчезают на старых движках |
| `mask-image`, `backdrop-filter`, blur | Зависит от версии/префикса | Зависит от версии/префикса | Должны оставаться необязательными эффектами; тяжёлый blur требует проверки слабых GPU |

Данные взяты из актуального [MDN browser-compat-data](https://github.com/mdn/browser-compat-data): [has](https://github.com/mdn/browser-compat-data/blob/main/css/selectors/has.json), [aspect-ratio](https://github.com/mdn/browser-compat-data/blob/main/css/properties/aspect-ratio.json), [inset](https://github.com/mdn/browser-compat-data/blob/main/css/properties/inset.json), [min](https://github.com/mdn/browser-compat-data/blob/main/css/types/min.json), [clamp](https://github.com/mdn/browser-compat-data/blob/main/css/types/clamp.json), [env](https://github.com/mdn/browser-compat-data/blob/main/css/types/env.json), [gap](https://github.com/mdn/browser-compat-data/blob/main/css/properties/gap.json).

Также `:focus-visible` смешан с `:hover` в обычных списках селекторов. Старый браузер, не понимающий один селектор, игнорирует всё правило, включая hover. Нужны независимые `:focus`/`:hover` правила, современные улучшения отдельно. [Правила обработки CSS-ошибок](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Syntax/Error_handling).

Рекомендуется заменить условные `:has()` на классы состояния, выставляемые JS; задать обычные размеры и стороны позиционирования перед современными декларациями; обеспечить квадратную обложку без обязательного `aspect-ratio`; добавить запасные отступы. Дизайн современного режима можно сохранить.

## JavaScript и запуск

### 1. Основная страница требует современный синтаксис даже в HTML5

`web.js` содержит async/await и динамический `import()`. Указание `sendspin=0` не исключает синтаксический разбор этих конструкций. Динамический import поддерживается с Chromium 63, Safari 11.1, Firefox 67. На более старом движке скрипт целиком не запускается. [BCD import](https://github.com/mdn/browser-compat-data/blob/main/javascript/operators/import.json).

`boot()` безусловно вызывает `prepareSendspinIdentity()`. На стенде при `sendspin=0` зарегистрирован **один импорт SDK**. Ошибка импорта перехватывается и на понимающем синтаксис движке HTML5 может продолжить работу, но лишние загрузка, криптография и задержка регистрации остаются. При отключённом bridge эту работу также нельзя считать необходимой.

Нужен независимый запуск HTML5 и необязательный загрузчик Sendspin. HTML5-профиль следует собирать для согласованной старой версии движка; одно понижение target SDK не решает синтаксис основного скрипта.

### 2. Идентификатор устройства

`createDeviceId()` обращается к `crypto.randomUUID` без проверки существования `crypto`. `getRandomValues` и `padStart` тоже не проверяются. На VM-стенде отсутствие crypto дало `Cannot read properties of undefined (reading 'randomUUID')`, WebSocket не был создан. Это диагностическая проверка сценария, не утверждение, что crypto отсутствует во всех старых TV.

`padStart` отсутствует в Chromium до 57. Явный `device_id` обходит генерацию ID, но не остальные требования скрипта. Нужен безопасный путь генерации обычного Kiosk ID. Криптографический ключ Sendspin нельзя заменять слабой случайностью. [BCD padStart](https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/String.json).

### 3. DOM и новые тексты песен

`replaceChildren()` требуется широким текстам песен и очереди. Поддержка: Chromium 86+, Safari 14+, Firefox 78+. Без него на VM-стенде получена ошибка `el.replaceChildren is not a function` при сообщении с lyrics. Нужен совместимый helper через удаление/добавление дочерних узлов. [BCD Element](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json).

### 4. Bundle Sendspin

Текущий bundle собран с target ES2022, содержит optional chaining, nullish coalescing и BigInt literals. Optional chaining требует Chromium 80+/Safari 13.1+, BigInt — Chromium 67+/Safari 14+, `DataView.getBigInt64` — Chromium 67+/Safari 15+. Понижение target может преобразовать часть синтаксиса, но не создаёт BigInt или поддерживаемый аудиотракт. Нельзя объявить минимальный браузер только по имени build target. [Optional chaining](https://github.com/mdn/browser-compat-data/blob/main/javascript/operators/optional_chaining.json), [BigInt](https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/BigInt.json), [DataView](https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/DataView.json).

## Звук, Sendspin и планшеты

1. **WebCodecs не обязателен для Sendspin, но обязателен для нашего Opus-пути.** На LAN HTTP `http://192.168.*` AudioDecoder недоступен из-за требования secure context. HTTP localhost, используемый стендом, не эквивалентен HTTP LAN. Отсутствие WebCodecs уже переводит Kiosk на FLAC/PCM. [W3C WebCodecs](https://www.w3.org/TR/webcodecs/#audiodecoder-interface), [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy).
2. **Проверка `typeof AudioDecoder` недостаточна.** SDK проверяет конкретную конфигурацию позже. Если AudioDecoder существует, но Opus-конфигурация не поддерживается, декодер переходит к software Opus, который в нашем bundle намеренно удалён. Из исходников следует риск подключённого клиента без воспроизводимых аудиоданных. Перед объявлением Opus нужен `AudioDecoder.isConfigSupported`; ошибка декодирования должна приводить к смене кодека/понятному fallback, а не только записи в console. [MDN isConfigSupported](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder/isConfigSupported_static).
3. **FLAC проверяется недостаточно.** В SDK 5.0.0 большинство не-Safari движков объявляют FLAC по косвенным признакам. Декодирование идёт через OfflineAudioContext.decodeAudioData; при ошибке возвращается null. Поддержка FLAC-файла в TV не подтверждает поддержку этого API. Проверять небольшим FLAC sample либо выбирать PCM для невалидированного движка. PCM при 48 kHz/16 bit/stereo требует 1.536 Mbit/s без служебных данных.
4. **Safari: AudioDecoder появился только в 26.0.** SDK 5.0.0 исключает FLAC для Safari; в старом Safari и на HTTP получается PCM, что само по себе допустимо. Отсутствие AudioDecoder не означает невозможность Sendspin. [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
5. **AudioContext без WebKit-префикса появился в Safari 14.1; getBigInt64 — в Safari 15.** Старый iPad может воспроизводить MP3 через HTML5, но не этот SDK без адаптации. [BCD AudioContext](https://github.com/mdn/browser-compat-data/blob/main/api/AudioContext.json), [BCD DataView](https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/DataView.json).
6. **HTML5-громкость на iOS ограничена платформой.** Ползунок меняет audio.volume и показания, но это не гарантирует изменение физической громкости. Для HTML5 нужен честный интерфейс системной громкости либо отдельно валидированный GainNode-путь. Поведение HTMLMediaElement нельзя автоматически переносить на Web Audio GainNode. [Apple iOS guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html), [BCD volume](https://github.com/mdn/browser-compat-data/blob/main/api/HTMLMediaElement.json).
7. **HTTPS-страница и Sendspin endpoint.** Наш default endpoint всегда `http://host:8927`, превращающийся в ws. На HTTPS странице такой endpoint может блокироваться как mixed content. Нужна корректная конфигурация HTTPS/WSS reverse proxy; простая замена схемы не добавит TLS серверу на 8927. [MDN mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content).
8. **Storage.** Собственный wrapper Kiosk ловит ошибки localStorage, но SDK читает/пишет storage напрямую. Restricted storage может сорвать создание Sendspin. Нужен общий безопасный adapter с памятью на время страницы, переданный и генератору identity, и SendspinPlayer, чтобы обе операции использовали один ключ. При отсутствии постоянного storage нельзя обещать стабильность ID после перезапуска.

Исходники проверенного SDK: `scripts/sendspin/node_modules/@sendspin/sendspin-js/dist/core/codec-support.js`, `audio/decoder.js`, `audio/scheduler.js`, `core/noise/identity.js`. Публичный проект: [Sendspin/sendspin-js](https://github.com/Sendspin/sendspin-js).

## Управление: touch, keyboard, пульт

- Запуск звука в capture-фазе слушает `pointerdown` и `keydown`, но не старые `touchstart`/`mousedown`/`click`. На touch-движке без Pointer Events возможен неработающий запуск звука. Нужен fallback без двойной активации, с play/resume внутри пользовательского жеста. [Chrome autoplay](https://developer.chrome.com/blog/web-audio-autoplay).
- Стрелки на фоне сейчас выполняют seek/volume; нет перемещения фокуса между кнопками для пульта. Tab есть не на каждом TV пульте. Панель показывается от mousemove/touchstart, но не от keydown. Нужны режим пульта/пространственная навигация, видимый фокус и показ панели при взаимодействии клавишами.
- Закрытие QR/volume обрабатывает Escape, но Samsung Back может иметь keyCode 10009. Необходима совместимость с key/keyCode и проверка реальных событий обычного browser URL. Привилегии Tizen и регистрация дополнительных кнопок относятся к packaged apps; их нельзя просто использовать на /kiosk. [Samsung remote](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html).
- LG Magic Remote поддерживает pointer и 5-way режимы; успешный pointer-тест не проверяет навигацию без указателя. [LG remote](https://webostv.developer.lge.com/develop/guides/magic-remote).
- Ползунок seek привязывает блокировку позиции к pointer events. Старые touch/mouse события должны сохранять корректную обработку перетаскивания; нативные range/input/change уже дают полезную основу.
- Визуальный QR 84/88 CSS px можно увеличивать кликом; реальную читаемость и доступность увеличения с пульта нужно проверить на TV с дистанции просмотра.

## Android kiosk / WebView и длительная работа

- Определяет совместимость фактическая версия Android System WebView или зафиксированного движка приложения, а не только версия Android. [Chrome WebView](https://developer.chrome.com/docs/webview), [Chromium WebView compatibility](https://github.com/chromium/chromium/blob/main/android_webview/docs/web-platform-compatibility.md).
- Hosting app может запрещать HTTP и требовать жест для media playback. Это не исправляется CSS/JS провайдера. [Android gesture setting](https://developer.android.com/reference/android/webkit/WebSettings#setMediaPlaybackRequiresUserGesture(boolean)), [Android cleartext policy](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic).
- У Kiosk нет отдельных обработчиков visibility/pageshow/online для восстановления suspended аудио; SDK имеет свои reconnect/scheduler механизмы, но их наличия недостаточно для заявления о восстановлении после сна на каждом планшете.
- Нет Screen Wake Lock; системный kiosk режим должен отдельно удерживать экран/запрет сна. Добавление необязательного wake lock возможно только как дополнение, не универсальная замена настройки устройства.
- Для слабых устройств полезен профиль с отключённым visualizer/backdrop blur, ограничением частоты перерисовки и повторной синхронизацией после возвращения страницы. Сейчас lyrics-follow использует RAF и без включённого visualizer. Реальные CPU/GPU измерения в этом аудите не выполнялись.

## Приоритет исправлений

### P0 — HTML5 должен запускаться независимо

1. Изолировать optional Sendspin loader; не загружать его для чистого HTML5/отключённого bridge.
2. Определить и собрать совместимый основной JS-профиль; защитить генерацию ID, заменить обязательный replaceChildren.
3. Запасные CSS размеры, квадратная обложка, top/right/bottom/left; классы состояния вместо обязательного has.

### P1 — устройства и звук

4. Pointer/touch/mouse fallback; remote focus/Enter/Back и показ controls от клавиш.
5. Проверять доступность Opus/FLAC по фактическим возможностям; PCM и HTML5 fallback; безопасный storage; понятное сообщение о выбранном режиме.
6. Отдельно обработать iOS volume и HTTPS/WSS endpoint.

### P2 — длительная работа и производительность

7. Сценарии сна/пробуждения/сети, необязательный wake lock и облегчённые эффекты.

Разумная первая цель — HTML5 MP3 с основными элементами управления на Chromium 53+ и старых Safari с async/import вынесенными из обязательного скрипта. Это предлагаемая граница следующей реализации, а не обещание уже существующей поддержки. Для Chromium 38/WebKit TV 2016 потребовался бы отдельный ещё более простой профиль; выгоду нужно оценить отдельно. Sendspin включать по обнаруженным возможностям, сохраняя HTML5 как базовый транспорт. Полифилл BigInt для этого криптографического SDK не предлагается.

## Матрица последующей проверки

Chrome/Chromium 53, 63, 68/69, 76/79, 85/87, 94, 108 и современный; Firefox 78/115/121 и современный; iPad Safari 14/15/15.4 и современный; актуальный и фиксированный старый Android WebView; реальные Samsung/LG хотя бы одного старого и одного нового поколения.

Для каждого: загрузка/регистрация; HTML5 MP3; Sendspin PCM и FLAC/Opus при наличии; HTTP LAN и HTTPS; первый жест; portrait/landscape/низкий экран; тексты песен/очередь/QR; seek/end/next/volume; только пульт; отказ storage; reconnect; сон/возврат; длительное воспроизведение.

Desktop-эмуляция возможностей и Node VM полезны для регрессий, но не подтверждают аппаратный декодер, реальные ограничения аудио, GPU или события TV-пульта. Код провайдера в ходе аудита не изменён.
