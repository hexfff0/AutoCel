(function () {
    var win = new Window("palette", "Batch Comp Duration", undefined);
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 15;
    win.margins = 20;

    // --- Mode selection section ---
    var modeGrp = win.add("group");
    var radioFrame = modeGrp.add("radiobutton", undefined, "Total Frames");
    var radioSecFrame = modeGrp.add("radiobutton", undefined, "Sec + Frames");
    radioFrame.value = true;

    var inputGrp = win.add("group");
    inputGrp.orientation = "row";

    // Seconds input field
    var valSec = inputGrp.add("edittext", undefined, "1");
    valSec.characters = 4;
    valSec.visible = false;
    var lblSec = inputGrp.add("statictext", undefined, "sec +");
    lblSec.visible = false;

    // Frames input field
    var valFrm = inputGrp.add("edittext", undefined, "1");
    valFrm.characters = 4;
    var lblFrm = inputGrp.add("statictext", undefined, "frames");

    // UI visibility toggle logic
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

    var btnRun = win.add("button", undefined, "Apply to Selected Comps");

    btnRun.onClick = function () {
        var selectedItems = app.project.selection;
        var comps = [];

        for (var i = 0; i < selectedItems.length; i++) {
            if (selectedItems[i] instanceof CompItem) {
                comps.push(selectedItems[i]);
            }
        }

        if (comps.length === 0) {
            alert("Please select at least one Composition before proceeding.");
            return;
        }

        app.beginUndoGroup("Change Duration");

        for (var j = 0; j < comps.length; j++) {
            var c = comps[j];
            var fps = 1 / c.frameDuration; // Retrieve the FPS value of the composition
            var totalFrames = 0;

            if (radioFrame.value) {
                totalFrames = parseInt(valFrm.text);
            } else {
                // Formula: (seconds * fps) + remaining frames
                totalFrames = (parseInt(valSec.text) * fps) + parseInt(valFrm.text);
            }

            // Convert total frames back to seconds to assign to the AE duration property
            // High precision is maintained by dividing by fps
            c.duration = totalFrames / fps;
        }

        app.endUndoGroup();
        alert("Operation completed successfully.");
    };

    win.center();
    win.show();
})();
