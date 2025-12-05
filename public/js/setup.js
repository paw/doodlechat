let username = localStorage.getItem('draw-username'),
    ucolor = localStorage.getItem('draw-color'),
    preview_wrapper = document.querySelector("#preview");

function preview() {
    preview_wrapper.style=`color: ${document.getElementById("ucolor").value}`;
    preview_wrapper.innerText = document.getElementById("user").value;
}

function saveSettings() {
    preview();

    if (! (document.getElementById("user").value.length <= 20 && document.getElementById("user").value.length >= 1) ) {
        alert("You must enter a valid username between 1 and 20 characters in length.")
        document.getElementById("user").value = '';
        document.getElementById("user").focus();
        return;
    }
    // validate
    if (!isColor(document.getElementById("ucolor").value)) {
        alert("You must enter a valid color.")
        document.getElementById("ucolor").value = '';
        document.getElementById("ucolor").focus();
        return;
    }
    alert("Settings saved.")
    localStorage.setItem('draw-username',document.getElementById("user").value);
    localStorage.setItem('draw-color',document.getElementById("ucolor").value);
}

function init() {
    let userinput = document.getElementById("user"),
    colorinput = document.getElementById("ucolor"),
    save = document.getElementById("save"),
    previewer = document.getElementById("previewer");

    // load vals
    userinput.value = (username != null) ? username : '';
    colorinput.value = (ucolor != null) ? ucolor : '';
    
    if (!(username == null || ucolor == null)) {
        preview();
    }

    save.addEventListener("click", function(e) {saveSettings()});
    previewer.addEventListener("click", function(e){preview()});
}

init();

