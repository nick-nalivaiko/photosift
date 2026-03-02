@echo off
echo Copying new favicon...
copy /Y "C:\Users\Nicko\.gemini\antigravity\brain\e127ad34-509c-46d6-9611-f126b5edf5bd\facesorter_logo_yellow_blue_1772344662188.png" "C:\Users\Nicko\Documents\MEGA HP\Development\FaceSorter\public\favicon.png"

echo Generating Tauri icons...
npm run tauri icon public\favicon.png

echo Done!
