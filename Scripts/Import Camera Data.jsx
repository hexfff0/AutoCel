(function createCameraSolidFromCSV() {
    var win = new Window("palette", "Import Camera Data", undefined);
    win.orientation = "column";

    var inputGroup = win.add("group");
    inputGroup.add("statictext", undefined, "Width:");
    var widthIn = inputGroup.add("edittext", undefined, "1920");
    widthIn.characters = 5;
    inputGroup.add("statictext", undefined, "Height:");
    var heightIn = inputGroup.add("edittext", undefined, "1080");
    heightIn.characters = 5;

    var btnGroup = win.add("group");
    var runBtn = btnGroup.add("button", undefined, "Import");

    runBtn.onClick = function () {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("Please select a Composition before proceeding.");
            return;
        }

        var csvFile = File.openDialog("Select a CSV file");
        if (csvFile) {
            csvFile.open("r");
            var fullText = csvFile.read();
            csvFile.close();

            var lines = fullText.split(/\r|\n/);
            var dataRows = [];

            // 1. Store data in an array and sanitize input
            for (var i = 1; i < lines.length; i++) {
                // Retain only numeric characters, decimal points, commas, and minus signs
                var currentLine = lines[i].replace(/[^\d.,-]/g, "");
                if (currentLine === "" || currentLine.indexOf(",") === -1) continue;

                var cols = currentLine.split(",");
                dataRows.push({
                    f: parseFloat(cols[0]), // Frame
                    x: parseFloat(cols[1]), // X
                    y: parseFloat(cols[2]), // Y
                    s: parseFloat(cols[3]), // Scale
                    r: parseFloat(cols[4])  // Rotation
                });
            }

            // 2. Sort data by frame index
            dataRows.sort(function (a, b) {
                return a.f - b.f;
            });

            if (dataRows.length === 0) {
                alert("No valid data was found in the CSV file.");
                return;
            }

            app.beginUndoGroup("Create Camera Solid (Sorted)");

            var w = parseInt(widthIn.text);
            var h = parseInt(heightIn.text);
            var cameraSolid = comp.layers.addSolid([1, 1, 1], "camera", w, h, 1.0);
            cameraSolid.guideLayer = true;
            cameraSolid.label = 1;

            var posProp = cameraSolid.property("Position");
            var scaleProp = cameraSolid.property("Scale");
            var rotProp = cameraSolid.property("Rotation");

            // 3. Apply keyframes in the sorted order
            for (var j = 0; j < dataRows.length; j++) {
                var row = dataRows[j];
                var time = (row.f - 1) * comp.frameDuration;

                posProp.setValueAtTime(time, [row.x, row.y]);
                scaleProp.setValueAtTime(time, [row.s, row.s, 100]);
                rotProp.setValueAtTime(time, row.r);
            }

            // 4. Add Mask
            var maskGroup = cameraSolid.property("ADBE Mask Parade");
            var newMask = maskGroup.addProperty("ADBE Mask Atom");
            newMask.name = "Mask 1";

            // Create rectangle mask path (full layer size)
            var maskShape = new Shape();
            maskShape.vertices = [
                [0, 0],
                [w, 0],
                [w, h],
                [0, h]
            ];
            maskShape.closed = true;

            var maskPath = newMask.property("ADBE Mask Shape");
            maskPath.setValue(maskShape);

            // Set mask inverted property
            newMask.inverted = true;

            // 5. Add Stroke Effect
            var effects = cameraSolid.property("ADBE Effect Parade");
            var strokeEffect = effects.addProperty("Stroke");

            // Configure Stroke properties using the correct match names
            strokeEffect.property("ADBE Stroke-0001").setValue(1); // Path = Mask 1
            strokeEffect.property("ADBE Stroke-0010").setValue(1); // All Masks = Off
            strokeEffect.property("ADBE Stroke-0002").setValue([0, 80 / 255, 1]); // Color (blue RGB 0, 80, 255)
            strokeEffect.property("ADBE Stroke-0003").setValue(5.0); // Brush Size = 5.0
            strokeEffect.property("ADBE Stroke-0004").setValue(100); // Brush Hardness = 100%
            strokeEffect.property("ADBE Stroke-0005").setValue(100); // Opacity = 100%
            strokeEffect.property("ADBE Stroke-0008").setValue(0); // Start = 0%
            strokeEffect.property("ADBE Stroke-0009").setValue(100); // End = 100%
            strokeEffect.property("ADBE Stroke-0006").setValue(0); // Spacing = 0%
            strokeEffect.property("ADBE Stroke-0007").setValue(3); // Paint Style = On Original Image

            app.endUndoGroup();

            alert(
                "Processing completed successfully!\nMask (Inverted) and Stroke effect have been added."
            );

            win.close();
        }
    };

    win.center();
    win.show();
})();