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

                var scrollGroup = renameWin.add("panel", undefined, "Selected Files");
                scrollGroup.orientation = "column";
                scrollGroup.alignChildren = ["left", "top"];
                scrollGroup.maximumSize.height = 400;

                var inputRows = [];

                for (var i = 0; i < items.length; i++) {
                    var suggestedName = cleanSequenceName(items[i].name);
                    var row = scrollGroup.add("group");
                    row.add(
                        "statictext",
                        [0, 0, 180, 25],
                        (i + 1) + ". " + items[i].name,
                        { truncate: "middle" }
                    );
                    var editField = row.add("edittext", [0, 0, 200, 25], suggestedName);
                    inputRows.push(editField);
                }

                var btnGroup = renameWin.add("group");
                btnGroup.alignment = "center";
                btnGroup.add("button", undefined, "Cancel");
                btnGroup.add("button", undefined, "Create", { name: "ok" });

                if (renameWin.show() === 1) {
                    var names = [];
                    for (var j = 0; j < inputRows.length; j++) {
                        names.push(inputRows[j].text || "Comp_" + j);
                    }
                    return names;
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
                var newNames = createBatchRenameUI(selectedItems);

                if (newNames !== null) {
                    app.beginUndoGroup("Batch PreComp");

                    for (var k = 0; k < selectedItems.length; k++) {
                        var item = selectedItems[k];
                        var userName = newNames[k];
                        var targetFolder = item.parentFolder;

                        var width = (item.width > 0) ? item.width : 1920;
                        var height = (item.height > 0) ? item.height : 1080;
                        var pixelAspect = item.pixelAspect || 1;
                        var frameRate = item.frameRate || 30;
                        var duration = item.duration || (1 / frameRate);

                        var innerComp = project.items.addComp(
                            userName,
                            width,
                            height,
                            pixelAspect,
                            duration,
                            frameRate
                        );
                        innerComp.parentFolder = targetFolder;
                        innerComp.layers.add(item);

                        var outerComp = project.items.addComp(
                            userName + "_comp",
                            width,
                            height,
                            pixelAspect,
                            duration,
                            frameRate
                        );
                        outerComp.parentFolder = targetFolder;
                        outerComp.layers.add(innerComp);
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

        // --- Batch Comp Duration ---
        var divider1 = celPanel.add("panel");
        divider1.alignment = "fill";
        divider1.preferredSize.height = 2;

        var durationGrp = celPanel.add("group");
        durationGrp.orientation = "column";
        durationGrp.alignChildren = ["fill", "top"];
        durationGrp.alignment = ["fill", "top"];
        durationGrp.spacing = 3;

        var durationLabel = durationGrp.add("statictext", undefined, "Batch Comp Duration:");
        durationLabel.graphics.font = ScriptUI.newFont(durationLabel.graphics.font.name, "Bold", 11);

        var modeGrp = durationGrp.add("group");
        modeGrp.orientation = "row";
        modeGrp.alignment = ["center", "top"];
        var radioFrame = modeGrp.add("radiobutton", undefined, "Frames");
        var radioSecFrame = modeGrp.add("radiobutton", undefined, "Sec+Frames");
        radioFrame.value = true;

        var inputGrp = durationGrp.add("group");
        inputGrp.orientation = "row";
        inputGrp.alignment = ["center", "top"];

        var valSec = inputGrp.add("edittext", undefined, "1");
        valSec.characters = 4;
        valSec.visible = false;
        var lblSec = inputGrp.add("statictext", undefined, "s +");
        lblSec.visible = false;

        var valFrm = inputGrp.add("edittext", undefined, "1");
        valFrm.characters = 4;
        var lblFrm = inputGrp.add("statictext", undefined, "f");

        radioFrame.onClick = function () {
            valSec.visible = false;
            lblSec.visible = false;
            valFrm.text = "1";
        };
        radioSecFrame.onClick = function () {
            valSec.visible = true;
            lblSec.visible = true;
            valSec.text = "1";
            valFrm.text = "0";
        };

        var btnDuration = durationGrp.add("button", undefined, "Apply Duration");
        btnDuration.preferredSize.height = 28;
        btnDuration.alignment = ["fill", "top"];

        btnDuration.onClick = function () {
            var selectedItems = app.project.selection;
            var comps = [];

            for (var i = 0; i < selectedItems.length; i++) {
                if (selectedItems[i] instanceof CompItem) {
                    comps.push(selectedItems[i]);
                }
            }

            if (comps.length === 0) {
                alert("Please select at least one Composition.");
                return;
            }

            app.beginUndoGroup("Change Duration");

            for (var j = 0; j < comps.length; j++) {
                var c = comps[j];
                var fps = 1 / c.frameDuration;
                var totalFrames = 0;

                if (radioFrame.value) {
                    totalFrames = parseInt(valFrm.text);
                } else {
                    totalFrames = (parseInt(valSec.text) * fps) + parseInt(valFrm.text);
                }

                c.duration = totalFrames / fps;
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
        camDataGrp.alignChildren = ["fill", "top"];
        camDataGrp.alignment = ["fill", "top"];
        camDataGrp.spacing = 3;

        var camDataLabel = camDataGrp.add("statictext", undefined, "Import Camera Data:");
        camDataLabel.graphics.font = ScriptUI.newFont(camDataLabel.graphics.font.name, "Bold", 11);

        var sizeGrp = camDataGrp.add("group");
        sizeGrp.orientation = "row";
        sizeGrp.alignment = ["center", "top"];
        sizeGrp.add("statictext", undefined, "W:");
        var widthIn = sizeGrp.add("edittext", undefined, "1920");
        widthIn.characters = 5;
        sizeGrp.add("statictext", undefined, "H:");
        var heightIn = sizeGrp.add("edittext", undefined, "1080");
        heightIn.characters = 5;

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

            var w = parseInt(widthIn.text);
            var h = parseInt(heightIn.text);
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
