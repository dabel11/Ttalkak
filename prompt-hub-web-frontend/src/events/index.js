// @ts-check
import { appEvents as app } from "./app-events.mjs";
import { makeScrollEvents as makeScroll } from "./make-scroll-events.mjs";
import * as navigation from "./global-navigation-events.mjs";
import * as reportCommentForms from "./report-comment-form-events.mjs";
export const events = Object.freeze({ app, makeScroll, navigation, reportCommentForms });
