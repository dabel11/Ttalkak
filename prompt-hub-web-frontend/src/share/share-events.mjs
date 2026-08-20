export function bindShareEvents(root, actions, state) {
  const form = root.querySelector(".share-form");
  if (form) {
    form.addEventListener("input", () => {
      const data = new FormData(form);
      actions.updateDraft(data);
      actions.updatePreview(data);
    });
    const input = form.querySelector("input[name='tagSearch']");
    if (input) {
      input.addEventListener("compositionstart", () => { state.isComposingShareTag = true; });
      input.addEventListener("compositionend", () => { state.isComposingShareTag = false; actions.updateTagQuery(input.value); });
      input.addEventListener("input", (event) => { if (!state.isComposingShareTag && !event.isComposing) actions.updateTagQuery(input.value); });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !state.isComposingShareTag && !event.isComposing) {
          event.preventDefault();
          actions.addTag(input.value);
        }
      });
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      actions.submit(new FormData(form));
    });
  }
  root.querySelectorAll("[data-remove-share-tag]").forEach((button) => button.addEventListener("click", () => actions.removeTag(button.dataset.removeShareTag)));
  root.querySelectorAll("[data-add-share-tag]").forEach((button) => button.addEventListener("click", () => actions.addTag(button.dataset.addShareTag)));
}
