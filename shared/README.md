# Shared Make model

`make-message-model.js` is the canonical Make response, message, migration, history, executable-policy, and error model used by the web app and extension.

The extension imports this module directly. The web app loads a generated classic-script distribution at `prompt-hub-web-frontend/src/utils/make-message-model.js`.

After editing the canonical module, regenerate the web distribution:

```sh
node scripts/build-make-message-model.cjs
```

The web test suite fails when the generated file differs from the canonical source.
