(function (thisObj) {
    // ============================================================
    // AutoCel - Unified Script Panel
    // ============================================================

    // Panel resize handler for responsive layout
    function handlePanelResize() {
        this.layout.resize();
    }

    function setupPanelResize(panel) {
        panel.onResizing = panel.onResize = handlePanelResize;
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "AutoCel", undefined, { resizable: true });
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 12;

        // ============================================================
        // CEL SECTION
        // ============================================================
        var celPanel = win.add("panel", undefined, "Cel");
        celPanel.orientation = "column";
        celPanel.alignChildren = ["fill", "top"];
        celPanel.alignment = ["fill", "top"];
        celPanel.spacing = 5;
        celPanel.margins = 10;

        // --- Auto Image Sequence ---
        var btnAutoSeq = celPanel.add("button", undefined, "Auto Image Sequence");
        btnAutoSeq.preferredSize.height = 28;
        btnAutoSeq.alignment = ["fill", "top"];

        btnAutoSeq.onClick = function () {
            app.beginUndoGroup("Auto Image Sequence");

            var myProject = app.project;
            var selectedItems = myProject.selection;
            var foldersToProcess = [];

            function collectFolder(folder) {
                if (!(folder instanceof FolderItem)) return;
                var isDuplicate = false;
                for (var i = 0; i < foldersToProcess.length; i++) {
                    if (foldersToProcess[i] === folder) {
                        isDuplicate = true;
                        break;
                    }
                }
                if (!isDuplicate) foldersToProcess.push(folder);
            }

            function findFoldersRecursive(item) {
                if (item instanceof FolderItem) {
                    collectFolder(item);
                    for (var i = 1; i <= item.items.length; i++) {
                        findFoldersRecursive(item.items[i]);
                    }
                }
            }

            if (selectedItems.length > 0) {
                for (var i = 0; i < selectedItems.length; i++) {
                    var item = selectedItems[i];
                    if (item instanceof FolderItem) {
                        findFoldersRecursive(item);
                    } else if (item instanceof FootageItem && item.parentFolder) {
                        collectFolder(item.parentFolder);
                    }
                }
            } else {
                for (var k = 1; k <= myProject.items.length; k++) {
                    if (myProject.items[k] instanceof FolderItem) {
                        findFoldersRecursive(myProject.items[k]);
                    }
                }
                collectFolder(myProject.rootFolder);
            }

            function convertToSequence(targetFolder) {
                if (targetFolder.items.length === 0) return;

                var firstItem = null;
                for (var i = 1; i <= targetFolder.items.length; i++) {
                    if (
                        targetFolder.items[i] instanceof FootageItem &&
                        targetFolder.items[i].mainSource.file &&
                        !targetFolder.items[i].mainSource.isScene
                    ) {
                        firstItem = targetFolder.items[i];
                        break;
                    }
                }

                if (firstItem) {
                    var filePtr = firstItem.mainSource.file;
                    var fileName = filePtr.name;
                    var extension = fileName.substring(fileName.lastIndexOf("."));
                    var io = new ImportOptions(filePtr);
                    io.sequence = true;
                    io.forceAlphabetical = true;

                    try {
                        var newSeq = myProject.importFile(io);

                        for (var j = targetFolder.items.length; j >= 1; j--) {
                            var itemToDelete = targetFolder.items[j];
                            if (
                                itemToDelete !== newSeq &&
                                itemToDelete instanceof FootageItem &&
                                !itemToDelete.mainSource.isScene
                            ) {
                                if (
                                    itemToDelete.mainSource.file &&
                                    itemToDelete.mainSource.file.path === filePtr.path
                                ) {
                                    itemToDelete.remove();
                                }
                            }
                        }

                        newSeq.parentFolder = targetFolder;

                        var durationInFrames = Math.round(
                            newSeq.duration / newSeq.frameDuration
                        );
                        var startNumMatch = fileName.match(/\d+/);
                        if (startNumMatch) {
                            var startNumStr = startNumMatch[0];
                            var startNum = parseInt(startNumStr, 10);
                            var endNum = startNum + durationInFrames - 1;
                            var endNumStr = endNum.toString();
                            while (endNumStr.length < startNumStr.length) {
                                endNumStr = "0" + endNumStr;
                            }
                            var baseName = fileName
                                .replace(startNumStr, "")
                                .replace(extension, "");
                            newSeq.name =
                                baseName +
                                "[" +
                                startNumStr +
                                "-" +
                                endNumStr +
                                "]" +
                                extension;
                        }
                    } catch (err) { }
                }
            }

            if (foldersToProcess.length > 0) {
                for (var f = 0; f < foldersToProcess.length; f++) {
                    convertToSequence(foldersToProcess[f]);
                }
            }

            app.endUndoGroup();
        };

        // --- Auto PreComp ---
        var btnAutoPrecomp = celPanel.add("button", undefined, "Auto PreComp");
        btnAutoPrecomp.preferredSize.height = 28;
        btnAutoPrecomp.alignment = ["fill", "top"];

        btnAutoPrecomp.onClick = function () {
            function cleanSequenceName(name) {
                var baseName = name.split('.')[0];
                return baseName
                    .replace(/[\[\(].*?[\]\)]/g, "")
                    .replace(/[\s_]*\d+$/g, "");
            }

            function createBatchRenameUI(items) {
                var renameWin = new Window("dialog", "Batch PreComp", undefined);
                renameWin.orientation = "column";
                renameWin.alignChildren = ["fill", "top"];
                renameWin.spacing = 10;
                renameWin.margins = 16;

                // Number of PreComp Levels
                var levelGroup = renameWin.add("group");
                levelGroup.orientation = "row";
                levelGroup.alignment = ["left", "center"];
                levelGroup.add("statictext", undefined, "Number of PreComp Levels:");
                var levelInput = levelGroup.add("edittext", undefined, "2");
                levelInput.characters = 3;
                var btnUpdate = levelGroup.add("button", undefined, "Update");

                // Create scrolling group with fixed height
                var scrollPanel = renameWin.add("panel", undefined, "Compositions to Create");
                scrollPanel.orientation = "stack";
                scrollPanel.alignment = ["fill", "fill"];
                scrollPanel.preferredSize = [420, 400];

                var scrollGroup = scrollPanel.add("group");
                scrollGroup.orientation = "column";
                scrollGroup.alignChildren = ["left", "top"];
                scrollGroup.alignment = ["fill", "top"];

                var inputData = [];

                function buildCompList(numLevels) {
                    // Clear existing items
                    while (scrollGroup.children.length > 0) {
                        scrollGroup.remove(scrollGroup.children[0]);
                    }
                    inputData = [];

                    for (var i = 0; i < items.length; i++) {
                        var suggestedName = cleanSequenceName(items[i].name);

                        // Add header for this footage item
                        var headerGroup = scrollGroup.add("group");
                        headerGroup.orientation = "column";
                        headerGroup.alignChildren = ["left", "top"];
                        headerGroup.spacing = 3;

                        var header = headerGroup.add("statictext", undefined, (i + 1) + ". " + items[i].name);
                        header.graphics.font = ScriptUI.newFont(header.graphics.font.name, "Bold", 11);

                        var itemInputs = [];

                        // Create inputs for each level
                        for (var level = 1; level <= numLevels; level++) {
                            var row = headerGroup.add("group");
                            row.orientation = "row";
                            row.spacing = 5;

                            var levelLabel = row.add("statictext", undefined, "  Level " + level + ":");
                            levelLabel.preferredSize.width = 60;

                            var compName = suggestedName;
                            if (level === 1) {
                                compName = suggestedName;
                            } else if (level === 2) {
                                compName = suggestedName + "_comp";
                            } else {
                                compName = suggestedName + "_comp" + (level - 1);
                            }

                            var editField = row.add("edittext", undefined, compName);
                            editField.preferredSize.width = 300;

                            itemInputs.push(editField);
                        }

                        inputData.push({
                            item: items[i],
                            inputs: itemInputs
                        });

                        // Add spacing between items
                        if (i < items.length - 1) {
                            headerGroup.add("statictext", undefined, "");
                        }
                    }

                    renameWin.layout.layout(true);
                    renameWin.layout.resize();
                }

                // Initial build with 2 levels
                buildCompList(2);

                // Update button click handler
                btnUpdate.onClick = function () {
                    var levels = parseInt(levelInput.text);
                    if (isNaN(levels) || levels < 1) {
                        alert("Please enter a valid number (minimum 1).");
                        levelInput.text = "2";
                        return;
                    }
                    if (levels > 10) {
                        alert("Maximum 10 levels allowed.");
                        levelInput.text = "10";
                        levels = 10;
                    }
                    buildCompList(levels);
                };

                var divider = renameWin.add("panel");
                divider.alignment = "fill";
                divider.preferredSize.height = 2;

                var btnGroup = renameWin.add("group");
                btnGroup.alignment = "center";
                btnGroup.orientation = "row";
                var btnCancel = btnGroup.add("button", undefined, "Cancel");
                var btnCreate = btnGroup.add("button", undefined, "Create");

                btnCancel.onClick = function () {
                    renameWin.close(0);
                };

                btnCreate.onClick = function () {
                    renameWin.close(1);
                };

                // Rebuild once after buttons are created to fix layout
                buildCompList(2);

                // Trigger update after showing to fix layout
                if (renameWin.show() === 1) {
                    return inputData;
                }
                return null;
            }

            var project = app.project;
            var selectedItems = [];

            for (var i = 0; i < project.selection.length; i++) {
                if (project.selection[i] instanceof FootageItem) {
                    selectedItems.push(project.selection[i]);
                }
            }

            if (selectedItems.length === 0) {
                alert("Please select Footage items in the Project Panel.");
            } else {
                var compData = createBatchRenameUI(selectedItems);

                if (compData !== null) {
                    app.beginUndoGroup("Batch PreComp");

                    for (var k = 0; k < compData.length; k++) {
                        var item = compData[k].item;
                        var compNames = [];
                        for (var n = 0; n < compData[k].inputs.length; n++) {
                            compNames.push(compData[k].inputs[n].text || "Comp_" + k + "_" + n);
                        }

                        var targetFolder = item.parentFolder;
                        var width = (item.width > 0) ? item.width : 1920;
                        var height = (item.height > 0) ? item.height : 1080;
                        var pixelAspect = item.pixelAspect || 1;
                        var frameRate = item.frameRate || 30;
                        var duration = item.duration || (1 / frameRate);

                        // Create nested compositions
                        var previousComp = null;

                        for (var level = 0; level < compNames.length; level++) {
                            var newComp = project.items.addComp(
                                compNames[level],
                                width,
                                height,
                                pixelAspect,
                                duration,
                                frameRate
                            );
                            newComp.parentFolder = targetFolder;

                            if (level === 0) {
                                // First level: add the footage item
                                newComp.layers.add(item);
                            } else {
                                // Subsequent levels: add the previous comp
                                newComp.layers.add(previousComp);
                            }

                            previousComp = newComp;
                        }
                    }

                    app.endUndoGroup();
                }
            }
        };

        // --- CSV Comp Linker ---
        var btnCSVLinker = celPanel.add("button", undefined, "CSV Comp Linker");
        btnCSVLinker.preferredSize.height = 28;
        btnCSVLinker.alignment = ["fill", "top"];

        btnCSVLinker.onClick = function () {
            app.beginUndoGroup("CSV Comp Linker");

            var targetComp = app.project.activeItem;
            if (!(targetComp instanceof CompItem)) {
                alert("Please open the destination Composition before running the script.");
                app.endUndoGroup();
                return;
            }

            var csvFile = File.openDialog("Select a CSV file", "*.csv");
            if (!csvFile) {
                app.endUndoGroup();
                return;
            }

            csvFile.open("r");
            var firstLine = csvFile.readln();
            var referenceLine = csvFile.readln();
            csvFile.close();

            if (!referenceLine) {
                alert("The reference row could not be found in the CSV file.");
                app.endUndoGroup();
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

            function findImageSequence(folder) {
                for (var i = 1; i <= folder.numItems; i++) {
                    var item = folder.item(i);
                    if (item instanceof FootageItem) {
                        if (item.mainSource instanceof FileSource) {
                            if (item.duration > 0 && item.frameDuration > 0) {
                                return item;
                            }
                        }
                    }
                }
                return null;
            }

            function findTopLevelComp(folder) {
                var allComps = [];
                collectAllComps(folder, allComps);

                if (allComps.length === 0) return null;
                if (allComps.length === 1) return allComps[0];

                var compIdMap = {};
                for (var i = 0; i < allComps.length; i++) {
                    compIdMap[allComps[i].id] = true;
                }

                var childCompIds = {};
                for (var i = 0; i < allComps.length; i++) {
                    var comp = allComps[i];
                    for (var j = 1; j <= comp.numLayers; j++) {
                        var layer = comp.layer(j);
                        if (layer.source && layer.source instanceof CompItem) {
                            if (compIdMap[layer.source.id]) {
                                childCompIds[layer.source.id] = true;
                            }
                        }
                    }
                }

                var candidates = [];
                var folderName = folder.name;

                for (var i = 0; i < allComps.length; i++) {
                    var comp = allComps[i];
                    var score = 0;

                    if (!childCompIds[comp.id]) score += 1000;
                    if (comp.name !== folderName) score += 50;
                    if (comp.numLayers > 1) score += 25;
                    score += comp.id * 0.001;

                    candidates.push({ comp: comp, score: score });
                }

                candidates.sort(function (a, b) {
                    return b.score - a.score;
                });

                return candidates[0].comp;
            }

            var count = 0;
            var notFound = [];
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
                        count++;
                    } else {
                        var imageSeq = findImageSequence(folder);

                        if (imageSeq) {
                            var newLayer = targetComp.layers.add(imageSeq);
                            newLayer.moveToBeginning();
                            newLayer.name = refName;
                            imageSeqCount++;
                            count++;
                        } else {
                            notFound.push(refName);
                        }
                    }
                } else {
                    notFound.push(refName);
                }
            }

            app.endUndoGroup();
        };

        // --- Divider ---
        var divider1 = celPanel.add("panel");
        divider1.alignment = "fill";
        divider1.preferredSize.height = 2;

        // --- Composition Settings ---
        var compSettingsGrp = celPanel.add("group");
        compSettingsGrp.orientation = "column";
        compSettingsGrp.alignChildren = ["left", "top"];
        compSettingsGrp.alignment = ["fill", "top"];
        compSettingsGrp.spacing = 3;

        var compSettingsLabel = compSettingsGrp.add("statictext", undefined, "Composition Settings:");
        compSettingsLabel.graphics.font = ScriptUI.newFont(compSettingsLabel.graphics.font.name, "Bold", 11);

        // Width
        var widthGrp = compSettingsGrp.add("group");
        widthGrp.orientation = "row";
        widthGrp.alignment = ["left", "center"];
        var widthCheck = widthGrp.add("checkbox", undefined, "Width:");
        widthCheck.preferredSize.width = 60;
        var widthInput = widthGrp.add("edittext", undefined, "1920");
        widthInput.characters = 5;
        widthInput.enabled = false;

        widthCheck.onClick = function () {
            widthInput.enabled = this.value;
        };

        // Height
        var heightGrp = compSettingsGrp.add("group");
        heightGrp.orientation = "row";
        heightGrp.alignment = ["left", "center"];
        var heightCheck = heightGrp.add("checkbox", undefined, "Height:");
        heightCheck.preferredSize.width = 60;
        var heightInput = heightGrp.add("edittext", undefined, "1080");
        heightInput.characters = 5;
        heightInput.enabled = false;

        heightCheck.onClick = function () {
            heightInput.enabled = this.value;
        };

        // FPS
        var fpsGrp = compSettingsGrp.add("group");
        fpsGrp.orientation = "row";
        fpsGrp.alignment = ["left", "center"];
        var fpsCheck = fpsGrp.add("checkbox", undefined, "FPS:");
        fpsCheck.preferredSize.width = 60;
        fpsCheck.value = true;
        var fpsInput = fpsGrp.add("edittext", undefined, "24");
        fpsInput.characters = 5;
        fpsInput.enabled = true;

        fpsCheck.onClick = function () {
            fpsInput.enabled = this.value;
        };

        // Duration Radio
        var durationModeGrp = compSettingsGrp.add("group");
        durationModeGrp.orientation = "row";
        durationModeGrp.alignment = ["left", "center"];
        var durationCheck = durationModeGrp.add("checkbox");
        durationCheck.preferredSize.width = 20;
        durationCheck.value = true;
        var durationRadioFrames = durationModeGrp.add("radiobutton", undefined, "Frames");
        var durationRadioSecFrames = durationModeGrp.add("radiobutton", undefined, "Sec+Frames");
        durationRadioFrames.value = true;
        durationRadioFrames.enabled = true;
        durationRadioSecFrames.enabled = true;

        durationCheck.onClick = function () {
            var enabled = this.value;
            durationRadioFrames.enabled = enabled;
            durationRadioSecFrames.enabled = enabled;
            durationSecInput.enabled = enabled && durationRadioSecFrames.value;
            durationFrameInput.enabled = enabled;
        };

        // Duration Input
        var durationInputGrp = compSettingsGrp.add("group");
        durationInputGrp.orientation = "row";
        durationInputGrp.alignment = ["left", "center"];

        var durationSecInput = durationInputGrp.add("edittext", undefined, "1");
        durationSecInput.characters = 4;
        durationSecInput.visible = false;
        durationSecInput.enabled = false;

        var durationSecLabel = durationInputGrp.add("statictext", undefined, "Sec");
        durationSecLabel.visible = false;

        var durationFrameInput = durationInputGrp.add("edittext", undefined, "1");
        durationFrameInput.characters = 4;
        durationFrameInput.enabled = true;

        var durationFrameLabel = durationInputGrp.add("statictext", undefined, "Frame");

        durationRadioFrames.onClick = function () {
            if (durationCheck.value) {
                durationSecInput.visible = false;
                durationSecLabel.visible = false;
                durationSecInput.enabled = false;
                durationFrameInput.enabled = true;
                durationFrameInput.text = "1";
            }
        };

        durationRadioSecFrames.onClick = function () {
            if (durationCheck.value) {
                durationSecInput.visible = true;
                durationSecLabel.visible = true;
                durationSecInput.enabled = true;
                durationFrameInput.enabled = true;
                durationSecInput.text = "1";
                durationFrameInput.text = "0";
            }
        };

        // Apply Button
        var btnApplySettings = compSettingsGrp.add("button", undefined, "Apply Settings");
        btnApplySettings.preferredSize.height = 28;
        btnApplySettings.alignment = ["fill", "top"];

        btnApplySettings.onClick = function () {
            var selectedComps = [];
            var selection = app.project.selection;

            if (selection.length === 0) {
                alert("Please select at least one composition in the Project panel.");
                return;
            }

            for (var i = 0; i < selection.length; i++) {
                if (selection[i] instanceof CompItem) {
                    selectedComps.push(selection[i]);
                }
            }

            if (selectedComps.length === 0) {
                alert("No compositions found in selection. Please select compositions.");
                return;
            }

            app.beginUndoGroup("Batch Composition Settings");

            for (var j = 0; j < selectedComps.length; j++) {
                var comp = selectedComps[j];

                // Apply Width
                if (widthCheck.value) {
                    var w = parseInt(widthInput.text);
                    if (!isNaN(w) && w > 0) {
                        comp.width = w;
                    }
                }

                // Apply Height
                if (heightCheck.value) {
                    var h = parseInt(heightInput.text);
                    if (!isNaN(h) && h > 0) {
                        comp.height = h;
                    }
                }

                // Apply Frame Rate
                if (fpsCheck.value) {
                    var fps = parseFloat(fpsInput.text);
                    if (!isNaN(fps) && fps > 0) {
                        comp.frameRate = fps;
                    }
                }

                // Apply Duration
                if (durationCheck.value) {
                    var fps = 1 / comp.frameDuration;
                    var totalFrames = 0;

                    if (durationRadioFrames.value) {
                        totalFrames = parseInt(durationFrameInput.text);
                    } else {
                        totalFrames = (parseInt(durationSecInput.text) * fps) + parseInt(durationFrameInput.text);
                    }

                    comp.duration = totalFrames / fps;
                }
            }

            app.endUndoGroup();
        };

        // ============================================================
        // CAMERA SECTION
        // ============================================================
        var cameraPanel = win.add("panel", undefined, "Camera");
        cameraPanel.orientation = "column";
        cameraPanel.alignChildren = ["fill", "top"];
        cameraPanel.alignment = ["fill", "top"];
        cameraPanel.spacing = 5;
        cameraPanel.margins = 10;

        // --- Import Camera Data ---
        var camDataGrp = cameraPanel.add("group");
        camDataGrp.orientation = "column";
        camDataGrp.alignChildren = ["left", "top"];
        camDataGrp.alignment = ["fill", "top"];
        camDataGrp.spacing = 3;

        var camDataLabel = camDataGrp.add("statictext", undefined, "Import Camera Data:");
        camDataLabel.graphics.font = ScriptUI.newFont(camDataLabel.graphics.font.name, "Bold", 11);

        var sizeGrp = camDataGrp.add("group");
        sizeGrp.orientation = "row";
        sizeGrp.alignment = ["left", "center"];
        sizeGrp.add("statictext", undefined, "Width:");
        var camWidthIn = sizeGrp.add("edittext", undefined, "1920");
        camWidthIn.characters = 5;
        sizeGrp.add("statictext", undefined, "Height:");
        var camHeightIn = sizeGrp.add("edittext", undefined, "1080");
        camHeightIn.characters = 5;

        var btnImportCam = camDataGrp.add("button", undefined, "Import Camera CSV");
        btnImportCam.preferredSize.height = 28;
        btnImportCam.alignment = ["fill", "top"];

        btnImportCam.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Please select a Composition before proceeding.");
                return;
            }

            var csvFile = File.openDialog("Select a CSV file");
            if (!csvFile) return;

            csvFile.open("r");
            var fullText = csvFile.read();
            csvFile.close();

            var lines = fullText.split(/\r|\n/);
            var dataRows = [];

            for (var i = 1; i < lines.length; i++) {
                var currentLine = lines[i].replace(/[^\d.,-]/g, "");
                if (currentLine === "" || currentLine.indexOf(",") === -1) continue;

                var cols = currentLine.split(",");
                dataRows.push({
                    f: parseFloat(cols[0]),
                    x: parseFloat(cols[1]),
                    y: parseFloat(cols[2]),
                    s: parseFloat(cols[3]),
                    r: parseFloat(cols[4])
                });
            }

            dataRows.sort(function (a, b) {
                return a.f - b.f;
            });

            if (dataRows.length === 0) {
                alert("No valid data was found in the CSV file.");
                return;
            }

            app.beginUndoGroup("Create Camera Solid");

            var w = parseInt(camWidthIn.text);
            var h = parseInt(camHeightIn.text);
            var cameraSolid = comp.layers.addSolid([1, 1, 1], "camera", w, h, 1.0);
            cameraSolid.guideLayer = true;
            cameraSolid.label = 1;

            var posProp = cameraSolid.property("Position");
            var scaleProp = cameraSolid.property("Scale");
            var rotProp = cameraSolid.property("Rotation");

            for (var j = 0; j < dataRows.length; j++) {
                var row = dataRows[j];
                var time = (row.f - 1) * comp.frameDuration;

                posProp.setValueAtTime(time, [row.x, row.y]);
                scaleProp.setValueAtTime(time, [row.s, row.s, 100]);
                rotProp.setValueAtTime(time, row.r);
            }

            var maskGroup = cameraSolid.property("ADBE Mask Parade");
            var newMask = maskGroup.addProperty("ADBE Mask Atom");
            newMask.name = "Mask 1";

            var maskShape = new Shape();
            maskShape.vertices = [[0, 0], [w, 0], [w, h], [0, h]];
            maskShape.closed = true;

            var maskPath = newMask.property("ADBE Mask Shape");
            maskPath.setValue(maskShape);
            newMask.inverted = true;

            var effects = cameraSolid.property("ADBE Effect Parade");
            var strokeEffect = effects.addProperty("Stroke");

            strokeEffect.property("ADBE Stroke-0001").setValue(1);
            strokeEffect.property("ADBE Stroke-0010").setValue(1);
            strokeEffect.property("ADBE Stroke-0002").setValue([0, 80 / 255, 1]);
            strokeEffect.property("ADBE Stroke-0003").setValue(5.0);
            strokeEffect.property("ADBE Stroke-0004").setValue(100);
            strokeEffect.property("ADBE Stroke-0005").setValue(100);
            strokeEffect.property("ADBE Stroke-0008").setValue(0);
            strokeEffect.property("ADBE Stroke-0009").setValue(100);
            strokeEffect.property("ADBE Stroke-0006").setValue(0);
            strokeEffect.property("ADBE Stroke-0007").setValue(3);

            app.endUndoGroup();
        };

        // --- Camera Link ---
        var divider2 = cameraPanel.add("panel");
        divider2.alignment = "fill";
        divider2.preferredSize.height = 2;

        var btnCameraLink = cameraPanel.add("button", undefined, "Camera Link");
        btnCameraLink.preferredSize.height = 28;
        btnCameraLink.alignment = ["fill", "top"];

        btnCameraLink.onClick = function () {
            app.beginUndoGroup("Apply Camera Link");

            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Please open a Composition before running this script.");
                app.endUndoGroup();
                return;
            }

            var selectedLayers = comp.selectedLayers;
            if (selectedLayers.length === 0) {
                alert("Please select at least one layer to apply Camera Link.");
                app.endUndoGroup();
                return;
            }

            var scaleExpression = 'transform.scale;\n' +
                'for (var i = 1; i < source.numLayers + 1; ++i) {\n' +
                'bclr = source.layer(i);\n' +
                'if (bclr.name.indexOf("camera") == 0 && (bclr.time>=bclr.inPoint) && (bclr.time<bclr.outPoint)){\n' +
                'bc = source.layer(i);\n' +
                'scl = bc.scale.valueAtTime(time-thisLayer.startTime) * 0.01;\n' +
                'while (true){\n' +
                'if(!bc.hasParent) break;\n' +
                'bc = bc.parent;\n' +
                'for (var i=0; i < 2; i++) {scl[i]*=bc.scale.valueAtTime(time-thisLayer.startTime)[i]/100}\n' +
                '}\n' +
                '[1/scl[0]*transform.scale[0],1/scl[1]*transform.scale[1]]\n' +
                'break;}transform.scale;}';

            var positionExpression = 'transform.position;\n' +
                'for (var i = 1; i < source.numLayers + 1; ++i) {\n' +
                'bclr = source.layer(i);\n' +
                'if (bclr.name.indexOf("camera") == 0 && (bclr.time>=bclr.inPoint) && (bclr.time<bclr.outPoint)){\n' +
                'source.layer(i).transform.anchorPoint.valueAtTime(time-thisLayer.startTime);\n' +
                'break;}transform.position;}';

            var rotationExpression = 'transform.rotation;\n' +
                'for (var i = 1; i < source.numLayers + 1; ++i) {\n' +
                'bclr = source.layer(i);\n' +
                'if (bclr.name.indexOf("camera") == 0 && (bclr.time>=bclr.inPoint) && (bclr.time<bclr.outPoint)){\n' +
                'rt = source.layer(i).toWorldVec([1,0,0],time-thisLayer.startTime); -radiansToDegrees(Math.atan2(rt[1],rt[0]));\n' +
                'break;}transform.rotation;}';

            var anchorPointExpression = 'transform.anchorPoint;\n' +
                'for (var i = 1; i < source.numLayers + 1; ++i) {\n' +
                'bclr = source.layer(i);\n' +
                'if (bclr.name.indexOf("camera") == 0 && (bclr.time>=bclr.inPoint) && (bclr.time<bclr.outPoint)){\n' +
                'bc = source.layer(i);\n' +
                'bc.toWorld(bc.anchorPoint.valueAtTime(time-thisLayer.startTime));\n' +
                'break;}transform.anchorPoint;}';

            var appliedCount = 0;

            for (var i = 0; i < selectedLayers.length; i++) {
                var layer = selectedLayers[i];
                var transform = layer.property("ADBE Transform Group");

                if (transform) {
                    try {
                        var scaleProp = transform.property("ADBE Scale");
                        if (scaleProp && scaleProp.canSetExpression) {
                            scaleProp.expression = scaleExpression;
                        }

                        var positionProp = transform.property("ADBE Position");
                        if (positionProp && positionProp.canSetExpression) {
                            positionProp.expression = positionExpression;
                        }

                        var rotationProp = transform.property("ADBE Rotate Z");
                        if (rotationProp && rotationProp.canSetExpression) {
                            rotationProp.expression = rotationExpression;
                        }

                        var anchorProp = transform.property("ADBE Anchor Point");
                        if (anchorProp && anchorProp.canSetExpression) {
                            anchorProp.expression = anchorPointExpression;
                        }

                        appliedCount++;
                    } catch (err) { }
                }
            }

            app.endUndoGroup();
        };

        // ============================================================
        // SHOW WINDOW
        // ============================================================
        // Setup resize handler for docked panels
        if (win instanceof Panel) {
            setupPanelResize(win);
        }

        if (win.layout) {
            win.layout.layout(true);
            win.layout.resize();
        }

        if (win instanceof Window) {
            win.center();
            win.show();
        }

        return win;
    }

    buildUI(thisObj);

})(this);
