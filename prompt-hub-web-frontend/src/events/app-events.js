(function attachAppEvents(global) {
  "use strict";

  function bindAppEvents(groups) {
    groups.bindCoreEvents();
    groups.bindMakeEvents();
  }

  global.TtalkakEvents = Object.freeze({
    ...(global.TtalkakEvents || {}),
    bindAppEvents,
  });
})(window);
