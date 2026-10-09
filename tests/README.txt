Tests need puppeteer-core + ws (e.g. run them from a folder where they are installed: cp tests/*.js /tmp/embertest && cd /tmp/embertest).
Unit (no browser):  node tests/unit.js
Browser/ws:         node solo.js <url>/ ; node coop.js <url>/ ; node ws.js <url> ; node chars_solo.js <url>/ <char> ; node chars_coop.js <url>/ ;
                    node chars_mobile.js <url>/ ; node weapons.js <url>/ ; node progress.js <url>/ ; node coop_progress.js <url>/ ; node floor3.js <url>/ ; node theme.js <url>/
Screenshots go to /tmp/embertest/ (shots_v3/ for weapons, Forge, skill upgrades, tooltips).
