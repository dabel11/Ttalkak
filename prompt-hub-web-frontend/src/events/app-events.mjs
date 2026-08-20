  "use strict";

  function bindAppEvents(groups) {
    groups.bindCoreEvents();
    groups.bindMakeEvents();
  }

  const appEvents = Object.freeze({
    bindAppEvents,
  });
export { appEvents };
