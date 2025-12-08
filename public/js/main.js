function ready() {
    document.querySelectorAll(".subnav").forEach(option => {
        option.querySelector("button").addEventListener("click", (event) => {
            document.querySelectorAll(`.dropdown.show:not([data-menu="${option.getAttribute("data-menu")}"])`).forEach(dropdown => {
                dropdown.classList.remove("show")
            });
            option.querySelector(".dropdown").classList.toggle("show");
        });
    })
    document.querySelectorAll(".dropdown li").forEach(option => {
        option.addEventListener("click", (event) => {
            console.log(option.getAttribute("data-action"));
        });
    })
    let params = new URLSearchParams(document.location.search);
    let kicked = params.get("kicked");
    if (kicked != null) {
      alert('You have been kicked. Sorry!');
      window.location.replace("/")
    }

};

// Source - https://stackoverflow.com/a/56266358
const isColor = (strColor) => {
  const s = new Option().style;
  s.color = strColor;
  return s.color !== '';
}

// this is required for the (not so) edge case where your script is loaded after the document has loaded
// https://developer.mozilla.org/en/docs/Web/API/Document/readyState
if (document.readyState !== 'loading') {
  ready()
} else {
  // the document hasn't finished loading/parsing yet so let's add an event handler
  document.addEventListener('DOMContentLoaded', ready)
}