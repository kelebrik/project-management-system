on run argv
  set prodOrigin to "https://tv-dashboard.rnd.dev.sberdevices.ru"
  set modeName to "dry-run"
  if (count of argv) >= 1 then set modeName to item 1 of argv

  if modeName is not "dry-run" and modeName is not "full-dry-run" and modeName is not "phases-only" and modeName is not "repair-phases" and modeName is not "full" and modeName is not "full-verify" then
    error "Неизвестный режим запуска: " & modeName
  end if

  set mutationToken to ""
  set targetPath to "/new-project"
  if modeName is "full-dry-run" or modeName is "full-verify" then
    set targetPath to "/TEMPLATE-V2/wbs"
  else if modeName is "repair-phases" then
    if (count of argv) < 2 or item 2 of argv is not "RUN_PHASE_DATE_REPAIR" then
      error "Восстановление дат не запущено. Повторите с отдельным аргументом RUN_PHASE_DATE_REPAIR."
    end if
    set mutationToken to "REPAIR_TEMPLATE_V2_PHASE_DATES"
    set targetPath to "/TEMPLATE-V2/wbs"
  else if modeName is "phases-only" then
    set mutationToken to "CREATE_TEMPLATE_V2_PHASES"
  else if modeName is "full" then
    if (count of argv) < 2 or item 2 of argv is not "RUN_FULL_IMPORT" then
      error "Полный импорт не запущен. Повторите с отдельным аргументом RUN_FULL_IMPORT."
    end if
    set mutationToken to "IMPORT_TEMPLATE_V2_PACKAGES"
    set targetPath to "/TEMPLATE-V2/wbs"
  end if

  set runnerPath to POSIX path of (path to me)
  set scriptDirectory to do shell script "/usr/bin/dirname " & quoted form of runnerPath
  set browserScriptPath to scriptDirectory & "/create-template-v2-via-ui.js"
  set browserScript to read POSIX file browserScriptPath as «class utf8»

  tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set targetTab to make new tab at end of tabs of front window with properties {URL:prodOrigin & targetPath}
    set active tab index of front window to count of tabs of front window

    repeat with attempt from 1 to 120
      if loading of targetTab is false then exit repeat
      delay 0.5
    end repeat

    set optionsScript to "window.__TEMPLATE_V2_UI_IMPORT_OPTIONS__={mode:'" & modeName & "',mutationToken:'" & mutationToken & "'};"
    execute targetTab javascript optionsScript
    execute targetTab javascript browserScript

    repeat with attempt from 1 to 5400
      delay 1
      set stateJson to execute targetTab javascript "window.__TEMPLATE_V2_UI_IMPORT__ ? JSON.stringify(window.__TEMPLATE_V2_UI_IMPORT__) : ''"
      if stateJson contains "\"status\":\"complete\"" then
        close targetTab
        return stateJson
      end if
      if stateJson contains "\"status\":\"error\"" then
        close targetTab
        error stateJson
      end if
    end repeat
    execute targetTab javascript "window.__TEMPLATE_V2_UI_IMPORT_ABORT__=true"
    repeat with attempt from 1 to 60
      delay 1
      set stateJson to execute targetTab javascript "window.__TEMPLATE_V2_UI_IMPORT__ ? JSON.stringify(window.__TEMPLATE_V2_UI_IMPORT__) : ''"
      if stateJson contains "\"status\":\"error\"" then exit repeat
    end repeat
    close targetTab
    error "Сценарий превысил 90 минут; браузерному импорту отправлен флаг остановки. Последнее состояние: " & stateJson
  end tell
end run
