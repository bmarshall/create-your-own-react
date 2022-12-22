import { Didact } from "./Didact.js";

/*const element = Didact.createElement(
    "div",
    { id: "foo" },
    Didact.createElement("a", null, "bar"),
    Didact.createElement("b")
  );
*/

// Tell babel to use our custom create element function instead of react
/** @jsxRuntime classic */
/** @jsx Didact.createElement */
const element = (
    <div>
      <h1>Hello World</h1>
      <div><h2>Hello World</h2></div>
    </div>
);

const container = document.getElementById("root")

//ReactDOM.render(element, container)
Didact.render(element, container);

console.log(Didact)