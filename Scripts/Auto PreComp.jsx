{
    // Function for cleaning sequence names
    // (removes patterns such as [0000-0010] or trailing _00001)
    function cleanSequenceName(name) {
        // Remove the file extension first
        var baseName = name.split('.')[0];
        // Use Regular Expressions to remove [numbers], (numbers),
        // or trailing numeric suffixes
        // Example: "Shot_01_[000-100]" -> "Shot_01_"
        return baseName
            .replace(/[\[\(].*?[\]\)]/g, "")
            .replace(/[\s_]*\d+$/g, "");
    }

    function createBatchRenameUI(items) {
        var win = new Window("dialog", "Batch PreComp (Smart Folder)", undefined);
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 10;
        win.margins = 16;

        // Scrollable display section (for handling a large number of selected files)
        var scrollGroup = win.add("panel", undefined, "Selected File List");
        scrollGroup.orientation = "column";
        scrollGroup.alignChildren = ["left", "top"];
        scrollGroup.maximumSize.height = 400; // Limit the window height

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

        var btnGroup = win.add("group");
        btnGroup.alignment = "center";
        var cancelBtn = btnGroup.add("button", undefined, "Cancel");
        var okBtn = btnGroup.add("button", undefined, "Create Comp", { name: "ok" });

        if (win.show() === 1) {
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
            app.beginUndoGroup("Batch PreComp in Folder");

            for (var k = 0; k < selectedItems.length; k++) {
                var item = selectedItems[k];
                var userName = newNames[k];
                var targetFolder = item.parentFolder; // Retrieve the source folder

                var width = (item.width > 0) ? item.width : 1920;
                var height = (item.height > 0) ? item.height : 1080;
                var pixelAspect = item.pixelAspect || 1;
                var frameRate = item.frameRate || 30;
                var duration = item.duration || (1 / frameRate);

                // Create the inner composition and move it to the same folder as the source
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

                // Create the outer composition and move it to the same folder as the source
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
}
