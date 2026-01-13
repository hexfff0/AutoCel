(function () {
    app.beginUndoGroup("CSV Comp Linker");

    var targetComp = app.project.activeItem;
    if (!(targetComp instanceof CompItem)) {
        alert("Please open the destination Composition before running the script.");
        return;
    }

    var csvFile = File.openDialog("Select a CSV file", "*.csv");
    if (!csvFile) return;

    csvFile.open("r");
    var firstLine = csvFile.readln();
    var referenceLine = csvFile.readln();
    csvFile.close();

    if (!referenceLine) {
        alert("The reference row could not be found in the CSV file.");
        return;
    }

    function parseCSVLine(line) {
        var result = [];
        var current = "";
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (c === '"') {
                inQuotes = !inQuotes;
            } else if (c === "," && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += c;
            }
        }
        result.push(current);
        return result;
    }

    var rawRefs = parseCSVLine(referenceLine);
    var references = [];
    for (var i = 0; i < rawRefs.length; i++) {
        var name = rawRefs[i].replace(/^\s+|\s+$/g, "");
        if (name === "" || name.toLowerCase() === "frame") continue;
        references.push(name);
    }

    function findFolderRecursive(name, parent) {
        for (var i = 1; i <= parent.numItems; i++) {
            var item = parent.item(i);
            if (item instanceof FolderItem) {
                if (item.name === name) return item;
                var found = findFolderRecursive(name, item);
                if (found) return found;
            }
        }
        return null;
    }

    function collectAllComps(folder, result) {
        for (var i = 1; i <= folder.numItems; i++) {
            var item = folder.item(i);
            if (item instanceof CompItem) {
                result.push(item);
            } else if (item instanceof FolderItem) {
                collectAllComps(item, result);
            }
        }
    }

    // ============================================================
    //  New function: Find image sequence in folder
    // ============================================================
    function findImageSequence(folder) {
        for (var i = 1; i <= folder.numItems; i++) {
            var item = folder.item(i);
            // Check if it's a FootageItem and is a sequence
            if (item instanceof FootageItem) {
                if (item.mainSource instanceof FileSource) {
                    // Check if it's an image sequence (has frameRate and duration > 0)
                    if (item.duration > 0 && item.frameDuration > 0) {
                        return item;
                    }
                }
            }
        }
        return null;
    }

    // ============================================================
    //  Combined multi-criteria evaluation (Original logic preserved)
    // ============================================================
    function findTopLevelComp(folder) {
        var allComps = [];
        collectAllComps(folder, allComps);

        if (allComps.length === 0) return null;
        if (allComps.length === 1) return allComps[0];

        var folderName = folder.name;

        //  Debug: display all Composition information
        var debugInfo = "Folder: " + folderName + "\n\nAll Compositions:\n";
        for (var d = 0; d < allComps.length; d++) {
            var c = allComps[d];
            debugInfo += "- " + c.name + " (layers: " + c.numLayers + ", id: " + c.id + ")\n";
        }

        // Create a map of Composition IDs
        var compIdMap = {};
        for (var i = 0; i < allComps.length; i++) {
            compIdMap[allComps[i].id] = true;
        }

        // Identify child Compositions (used as layers in other Compositions)
        var childCompIds = {};
        for (var i = 0; i < allComps.length; i++) {
            var comp = allComps[i];
            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                if (layer.source && layer.source instanceof CompItem) {
                    if (compIdMap[layer.source.id]) {
                        childCompIds[layer.source.id] = true;
                        debugInfo += "\n  → Comp '" + comp.name + "' uses '" + layer.source.name + "' (id: " + layer.source.id + ")";
                    }
                }
            }
        }

        debugInfo += "\n\nChild Composition IDs: ";
        for (var id in childCompIds) {
            debugInfo += id + ", ";
        }

        // ============================================================
        //  Selection priority:
        // 1. Not used as a layer in another Composition (+1000)
        // 2. Name does not match the folder name (+50)
        // 3. Contains more than one layer (+25)
        // 4. Highest ID value (created most recently) (+0.001 * id)
        // ============================================================

        var candidates = [];

        for (var i = 0; i < allComps.length; i++) {
            var comp = allComps[i];
            var score = 0;

            // Criterion 1: Not referenced as a layer (+1000) - THIS IS THE MOST IMPORTANT
            if (!childCompIds[comp.id]) {
                score += 1000;
            }

            // Criterion 2: Name differs from the folder name (+50)
            if (comp.name !== folderName) {
                score += 50;
            }

            // Criterion 3: Contains more than one layer (+25)
            if (comp.numLayers > 1) {
                score += 25;
            }

            // Criterion 4: Higher ID (created later) (+0.001 * id)
            score += comp.id * 0.001;

            candidates.push({ comp: comp, score: score });
        }

        // Sort by descending score
        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        debugInfo += "\n\nScores:\n";
        for (var c = 0; c < candidates.length; c++) {
            var cand = candidates[c];
            var isChild = childCompIds[cand.comp.id] ? " [CHILD]" : " [TOP-LEVEL]";
            debugInfo +=
                cand.comp.name +
                ": " +
                cand.score.toFixed(3) +
                isChild +
                "\n";
        }
        debugInfo += "\n Selected: " + candidates[0].comp.name;

        $.writeln(debugInfo); // Output to the Console

        return candidates[0].comp;
    }

    // ===============================
    // 5. Execute composition placement
    // ===============================

    var count = 0;
    var notFound = [];
    var foundList = [];
    var imageSeqCount = 0;

    for (var r = 0; r < references.length; r++) {
        var refName = references[r];
        var folder = findFolderRecursive(refName, app.project.rootFolder);

        if (folder) {
            var mainComp = findTopLevelComp(folder);

            if (mainComp) {
                var newLayer = targetComp.layers.add(mainComp);
                newLayer.moveToBeginning();
                newLayer.name = refName;
                foundList.push(refName + " → " + mainComp.name + " (Comp)");
                count++;
            } else {
                // No comp found, try to find image sequence
                var imageSeq = findImageSequence(folder);

                if (imageSeq) {
                    var newLayer = targetComp.layers.add(imageSeq);
                    newLayer.moveToBeginning();
                    newLayer.name = refName;
                    foundList.push(refName + " → " + imageSeq.name + " (Image Sequence)");
                    imageSeqCount++;
                    count++;
                } else {
                    notFound.push(refName + " (no Composition or Image Sequence found)");
                }
            }
        } else {
            notFound.push(refName + " (no Folder found)");
        }
    }

    app.endUndoGroup();
})();