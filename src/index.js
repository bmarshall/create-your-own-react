// Create the element objects from jsx that will be eventually turned into fibers
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map(child =>
        typeof child === "object" ? child : createTextElement(child)
      )
    }
  };
}

// This creates a special type of element to handle text elements so we can use the 
// same interface across the framework
function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}

// Given a fiber this will create a dom element and pass it down to update dom
// to have its properties attached
function createDom(fiber) {
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

// util functions used to help sort out what props need to be added/ removed / updated.
const isEvent = key => key.startsWith("on");
const isProperty = key => key !== "children" && !isEvent(key);
const isNew = (prev, next) => key => prev[key] !== next[key];
const isGone = (prev, next) => key => !(key in next);

// This function directly updates the dom element to remove, update and add new properties / event handlers
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach(name => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      dom[name] = nextProps[name];
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

// this function is called to to start the process of committing the fiber work objects
// to the dom. It starts on whatever wip is set to.  This value can be set in two places.
// 1.) When we call render to render our whole tree. (Not often)
// 2.) When a hook is called for us to update everything below where the hook is being used.  (More often)
function commitRoot() {
  // delete anything that was marked for deletion in reconcileChildren
  deletions.forEach(commitWork);
  // starting from wipRoot (whole tree, or just the point in which use effect was called)
  commitWork(wipRoot.child);
  // now that the wip is no longer wip, its the actually root, set it as the currentRoot
  currentRoot = wipRoot;
  // clear out the wip 
  wipRoot = null;
}

// this is where we will apply the changes to each node. 
function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  // find the closest fiber with a dom node
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  //  navigate all the way to the bottom then across to all siblings
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

// delete the node that has a dom element.  If this one keep traversing the children
// till you find one. 
function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    //when does this case happen?
    commitDeletion(fiber.child, domParent);
  }
}

// This kicks off the rendering of an element from the outside world. 
function render(element, container) {
  // create a wip root
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate: currentRoot
  };
  // reset the deletions since we dont have any 
  deletions = [];
  // set the wipRoot to be processed next round
  nextUnitOfWork = wipRoot;
}

// Where we will the next time our eventloop starts
let nextUnitOfWork = null;
// the last root that was stamped to the dom
let currentRoot = null;
// the root we will be building then stamping on the dom
let wipRoot = null;
// elements we will be removing
let deletions = null;

// this is the loop that iterates forever (outside of the event loop when the browser has time)
// it does two things. 
// 1.) Converts elements to fibers when the browser has free cycles
// 2.) When all elements have been converted to fibers we commit "stamp" them to the dom
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    // convert our elements to fiber threads to be stamped to the dom
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    // if there is nothing left to convert to fiber, its time to stamp our fiber to the dom
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

// the sneaky place where the work loop is started
requestIdleCallback(workLoop);


function performUnitOfWork(fiber) {
 
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    //build up any dom elements and covert children to fiber
    updateHostComponent(fiber);
  }

  //first process down the tree
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      // then to the right
      return nextFiber.sibling;
    }
    // then back up 
    nextFiber = nextFiber.parent;
  }
}

// This is a place to hold the fiber of the current functional component
let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  // reset the fibers hooks
  wipFiber.hooks = [];
  // generate the fibers children by calling the functional component. 
  // if the functional component uses our use state hook, the hook will use
  // the current wipFiber and hookIndex
  const children = [fiber.type(fiber.props)];

  // go ahead and reconcileChildren the children. 
  reconcileChildren(fiber, children);
}

function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  };

  const actions = oldHook ? oldHook.queue : [];
  // apply all of setState actions to the state and return that to the function component
  actions.forEach(action => {
    hook.state = action(hook.state);
  });

  // when setState is called
  const setState = action => {
    // push the action function on the queu
    hook.queue.push(action);
    // set the current wipRoot to the current root 
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    console.log('wipRoot', wipRoot)
    // tell our framework to process this and any node under it when set state is called
    nextUnitOfWork = wipRoot;
    deletions = [];

  };
  // push our hooks on the fiber
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

// this builds out the dom element to be used by the fiber, then creates fiber elements for all of its children.
function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

// given a wipFiber and its element children, we compare against the old fiber 
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type == oldFiber.type;

    // if the element has the same type as the oldFibers child fiber, then we need to create an update fiber
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE"
      };
      console.log("UPDATE", newFiber);
    }

    // if the element has a different type as the old child, we need to create a placement fiber
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT"
      };
      console.log("PLACEMENT", newFiber);
    }

    // if an old fiber exists and its not te same type, we need to create a delete fiber
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
      console.log("DELETE", oldFiber);
    }

    // move the old fiber pointer to the next sibling so we can compare those
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // set the child and sibling references
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

const Didact = {
  createElement,
  render,
  useState
};

/** @jsxRuntime classic */
/** @jsx Didact.createElement */
function Counter() {
  const [state, setState] = Didact.useState(1);
  const [state2, setState2] = Didact.useState(1);
  return (
    <div id="level 2">
      <h1 onClick={() => setState(c => c + 1)} style="user-select: none">
        Count: {state}
      </h1>
      {state % 2 === 0 ? (<b>Even</b>) : null}
    </div>
  );
}

function CouterWrapperOne () {

  return (
  <div id='CouterWrapperOne'>
    <b>CouterWrapperOne</b>
    <CouterWrapperTwo></CouterWrapperTwo>
  </div>)
};

function CouterWrapperTwo () {

  return (
  <div id='CouterWrapperTwo'>
    <b>CouterWrapperTwo</b>
    <Counter></Counter>
  </div>)
};

const element = <CouterWrapperOne />;
const container = document.getElementById("root");
Didact.render(element, container);
