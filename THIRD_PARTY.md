# Сторонние материалы

| Что | Откуда | Лицензия | Примечание |
|---|---|---|---|
| Сэмплы электрогитары (`app/samples/guitar`) | npm `tonejs-instrument-guitar-electric-mp3` 1.1.1 — проект tonejs-instruments (Nicholaus Brosowsky; пакеты npm — Makefully Studios, github.com/Makefully-Studios/tonejs-instruments) | **Сэмплы — CC BY 3.0** (creativecommons.org/licenses/by/3.0), код пакета — MIT | Нужно указывать авторство: оно есть в настройках приложения (⚙). Сэмпл Cs2 не используется: на слух доминирует 3-я гармоника; D2 и D♯2 берутся из E2 |
| Сэмплы бас-гитары (`app/samples/bass`) | npm `tonejs-instrument-bass-electric-mp3` 1.1.2 (тот же проект) | **Сэмплы — CC BY 3.0**, код пакета — MIT | Изменено: обрезаны до 3,2 с с затуханием, моно 112 кбит/с. Авторство — в настройках приложения |
| Шрифт Unbounded 800 (`app/css/fonts/unbounded-*`) | npm `@fontsource/unbounded` 5.3.0 | SIL OFL 1.1 | Текст лицензии: `licenses/OFL-Unbounded.txt` |
| Шрифт Inter (variable, `app/css/fonts/inter-*`) | npm `@fontsource-variable/inter` 5.3.0 | SIL OFL 1.1 | Текст лицензии: `licenses/OFL-Inter.txt` |

## Только для разработки (в приложение не попадает)

| Что | Лицензия | Зачем |
|---|---|---|
| `@playwright/test` (npm) и браузер Chromium для тестов | Apache-2.0 (Chromium — BSD и др.) | Браузерные проверки `npm run e2e` |

Новые библиотеки и сэмплы добавляй в эту таблицу (только свободные лицензии: MIT, CC0, CC BY, OFL и т. п.).

**Про CC BY 3.0.** Это свободная лицензия: сэмплы можно использовать и изменять, в том числе публично, если указать авторов,
ссылку на лицензию и что было изменено. Раньше в этой таблице для сэмплов ошибочно стояло «MIT»: так лицензирован только код
пакетов, а в их README прямо написано «Samples: CC-by 3.0».
