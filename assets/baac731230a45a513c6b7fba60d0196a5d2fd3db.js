function factory() {
  return {
    initAppForPage() {},
    createControllers() {
      return [];
    },
    exports() {
      return {};
    },
  };
}
if (typeof define !== "undefined") {
  define([], factory);
} else {
  module.exports = factory();
}
