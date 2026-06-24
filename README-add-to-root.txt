ARCHITECTURAL CENTER STATIC WEBSITE
===================================

Run the website locally on Windows
----------------------------------
The website loads JSON files, so it must run through a local HTTP server.
Do not open index.html directly with a file:/// address.

1. Double-click start-local-server.bat in the project root.
2. The script opens http://localhost:8000 in your default browser.
3. Keep the Command Prompt window open while viewing the website.
4. Press CTRL + C in that window to stop the server.

The script tries these Python commands in order:
1. python -m http.server 8000
2. py -m http.server 8000

GitHub Pages setup
------------------
1. Keep .nojekyll in the repository root.
2. Open GitHub repository Settings > Pages.
3. Set Source to "Deploy from a branch".
4. Select branch "main" and folder "/ (root)".

How to add a new project or resource
------------------------------------
1. Add the project image to images/.
2. Add a PDF to downloads/ if the item needs a downloadable report.
3. Add panorama files to panorama/ if the item includes a 360 tour.
4. Add one JSON item to the correct data/*.json file:
   - residential.json
   - commercial.json
   - government.json
   - interiors.json
   - panorama.json
   - knowledge.json
   - documents.json
5. Commit and push the changes.

Every JSON item supports:
title, subtitle, category, style, location, year, image, description,
url, pdf, panorama, and tags.

Use relative paths only. No build command is required.
