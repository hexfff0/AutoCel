(function () {
    app.beginUndoGroup("Auto Image Sequence");

    var myProject = app.project;
    var selectedItems = myProject.selection;
    var foldersToProcess = [];

    // --- 1. Helper function to validate and collect unique folders ---
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

    // --- 2. Recursive scan function to locate all folders under the selected hierarchy ---
    function findFoldersRecursive(item) {
        if (item instanceof FolderItem) {
            collectFolder(item);
            for (var i = 1; i <= item.items.length; i++) {
                findFoldersRecursive(item.items[i]);
            }
        }
    }

    // --- 3. Analyze the current selection ---
    if (selectedItems.length > 0) {
        for (var i = 0; i < selectedItems.length; i++) {
            var item = selectedItems[i];
            if (item instanceof FolderItem) {
                // If a folder is selected, recursively process all subfolders
                findFoldersRecursive(item);
            } else if (item instanceof FootageItem && item.parentFolder) {
                // If a file is selected, collect its parent folder
                collectFolder(item.parentFolder);
            }
        }
    } else {
        // If nothing is selected: collect all folders in the project and process root-level items
        for (var k = 1; k <= myProject.items.length; k++) {
            if (myProject.items[k] instanceof FolderItem) {
                findFoldersRecursive(myProject.items[k]);
            }
        }
        // Special case: also process files located directly in the project root
        collectFolder(myProject.rootFolder);
    }

    // --- 4. Core function for converting still images into an image sequence ---
    function convertToSequence(targetFolder) {
        if (targetFolder.items.length === 0) return;

        var firstItem = null;
        for (var i = 1; i <= targetFolder.items.length; i++) {
            // Locate the first valid still image (not an existing sequence and backed by a real file)
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

                // Remove the original still images
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

                // Rename sequence in the format: A[0001-0100].png
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
            } catch (err) {
                // Fail silently to avoid interrupting batch processing
            }
        }
    }

    // --- 5. Execute processing for all collected folders ---
    if (foldersToProcess.length > 0) {
        for (var f = 0; f < foldersToProcess.length; f++) {
            convertToSequence(foldersToProcess[f]);
        }
    }

    app.endUndoGroup();
})();
