# Prompt Polish Chrome Extension

React/Vite 기반 Chrome Side Panel 확장 프로그램 소스 프로젝트입니다. 기존 ZIP에 포함된 빌드 산출물을 기준으로 재구성했습니다.

## 실행

```bash
npm install
npm run build
```

빌드 후 Chrome에서 아래 폴더를 압축해제된 확장 프로그램으로 로드합니다.

```text
prompt-polish-chrome-extension-source/dist
```

Chrome 로드 순서:

1. `chrome://extensions` 열기
2. 개발자 모드 켜기
3. 압축해제된 확장 프로그램을 로드
4. `dist` 폴더 선택

## 구조

- `src/main.jsx`: 사이드 패널 React UI
- `src/styles.css`: 사이드 패널 스타일
- `public/manifest.json`: Chrome Extension Manifest V3 설정
- `public/background.js`: 확장 아이콘 클릭 시 사이드 패널 열기 및 ChatGPT/Gemini 입력창 주입 로직

## 참고

이 프로젝트는 원본 저장소를 그대로 복원한 것이 아니라, 제공된 ZIP의 실행 파일과 번들 UI를 바탕으로 재구성한 개발용 소스 프로젝트입니다.
