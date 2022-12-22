

//Generates Configs of Elements
//Type will look like this
/*const element = {
  type: "h1",
  props: {
    title: "foo",
    children: "Hello",
  },
}

we generate these configs something like this
const node = document.createElement(element.type)
node["title"] = element.props.title
*/
function createElement(type, props, ...children) {
    return {
      type,
      props: {
        ...props,
        children: children.map(child =>
          typeof child === "object"
            ? child
            : createTextElement(child)
        ),
      },
    }
  }
  
//Creates config options for text elements
function createTextElement(text) {
  return {
      type: "TEXT_ELEMENT",
      props: {
        nodeValue: text,
        children: [],
      },
  }
}


function render(element, container) {
  
  const dom =
    element.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(element.type);

  const isProperty = key => key !== "children"
  Object.keys(element.props)
    .filter(isProperty)
    .forEach(name => {
      dom[name] = element.props[name]
    });

  element.props.children.forEach(child =>
    render(child, dom)
  )

  container.appendChild(dom);
}
  
export const Didact = {
    createElement,
    render
}