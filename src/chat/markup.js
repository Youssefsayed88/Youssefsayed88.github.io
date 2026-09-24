// The chat's markup on both pages: on the level, a speech bubble over the robot
// and an input bar along the bottom; on the plain page, a panel down the side.
// The words and the form are shared, so the two read as the same robot.
//
// Every function returns '' when the build has no CHAT_URL (src/chat/config.js),
// so an unconfigured build carries no trace of the chat.
//
// Pure string-building, no DOM: vite.config.js, markup.js and build-classic.mjs
// run it under Node.

import { OWNER } from '../data/projects.js'
import { CHAT_URL } from './config.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const first = OWNER.name.split(' ')[0]

export const GREETING = `Hi! I'm the robot who runs this place. Ask me anything about ${first}'s work: his projects, what he built on them, his experience or his skills.`

// The plain page has no robot on it, so there it is simply the chatbot.
const PANEL_GREETING = `Hi! I'm ${first}'s portfolio assistant. Ask me anything about his work: his projects, what he built on them, his experience, his skills, or what he's looking for next.`

export const SUGGESTIONS = [
  `What did ${first} build in multiplayer?`,
  'Which project should I look at first?',
  'What XR and VR work has he done?',
  'How can I contact him?',
]

// Visitors are told both things that happen to a question, since they would
// not otherwise know: it is recorded, and a third party's model answers it.
const NOTE = 'Answered by AI (Google Gemini), and questions are recorded anonymously to improve this portfolio, so please leave out personal details. Answers can be wrong.'

const SEND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

function form(id) {
  return `
      <ul class="chat__suggestions" aria-label="Suggested questions">${SUGGESTIONS.map((q) => `
        <li><button type="button" class="chat__suggestion">${esc(q)}</button></li>`).join('')}
      </ul>
      <form class="chat__form" id="${id}-form">
        <label class="sr-only" for="${id}-input">Your question</label>
        <input class="chat__input" id="${id}-input" name="question" type="text" maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="Ask about ${esc(first)}'s work…">
        <button class="chat__send" type="submit" aria-label="Send">${SEND_ICON}</button>
      </form>
      <p class="chat__note">${esc(NOTE)}</p>`
}

// The callout by the chat button that offers the chat (src/chat/nudge.js).
function nudge(who = 'robot') {
  return `<div class="chat-nudge" id="chat-nudge" role="status" hidden>
      <button class="chat-nudge__body" type="button"><strong>Got a question about ${esc(first)}?</strong> ${who === 'robot' ? 'I can tell you about his projects, experience and skills. Ask me!' : 'The chatbot can tell you about his projects, experience and skills. Ask it!'}</button>
      <button class="chat-nudge__close" type="button" aria-label="Dismiss">&times;</button>
    </div>`
}

// The level: the button in the corner controls, in the accent so it reads as
// the robot's, with the callout beside it.
export function chatButtonMarkup() {
  if (!CHAT_URL) return ''
  return `<div class="chat-cta">
    <button class="controls__btn controls__btn--chat" id="chat-open" type="button" aria-expanded="false" aria-controls="chat-dock"><span class="chat-cta__dot" aria-hidden="true"></span>Ask the robot<kbd>C</kbd></button>
    ${nudge()}
  </div>`
}

// The level: the robot's side of the conversation, in the level so it scrolls
// with it. The same outline as the project bubble.
export function chatBubbleMarkup() {
  if (!CHAT_URL) return ''
  return `
    <div class="bubble chat-bubble" id="chat-bubble" hidden>
      <p class="chat-bubble__asked" hidden></p>
      <span class="bubble__typing" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="chat-bubble__reply chat__reply" aria-live="polite"></div>
      <p class="chat-bubble__error chat__error" role="alert" hidden></p>
      <svg class="bubble__tail" viewBox="0 0 22 12" aria-hidden="true"><path class="bubble__tail-fill" d="M0 0C6 0 10 3 11 12C12 3 16 0 22 0Z"/><path class="bubble__tail-line" d="M0 0.5C6 0.5 10 3 11 12C12 3 16 0.5 22 0.5"/></svg>
    </div>`
}

// The level: the visitor's side, along the bottom of the screen.
export function chatDockMarkup() {
  if (!CHAT_URL) return ''
  return `<section class="chat-dock chat" id="chat-dock" aria-label="Ask the robot" hidden>
    <button class="chat__close" type="button" aria-label="Close the chat">&times;</button>${form('chat-dock')}
  </section>`
}

// The plain page: a button in the corner, and the whole conversation in a
// panel down the side.
export function chatPanelMarkup() {
  if (!CHAT_URL) return ''
  return `<button class="chat-fab" id="chat-open" type="button" aria-expanded="false" aria-controls="chat-panel">
  <span class="chat-fab__dot" aria-hidden="true"></span>Ask the chatbot about ${esc(first)}
</button>
${nudge('chatbot')}
<aside class="chat-panel chat" id="chat-panel" aria-labelledby="chat-panel-title" hidden>
  <header class="chat-panel__head">
    <p class="chat-panel__title" id="chat-panel-title">Ask the chatbot</p>
    <button class="chat__close" type="button" aria-label="Close the chat">&times;</button>
  </header>
  <div class="chat-panel__log" aria-live="polite">
    <div class="chat-msg chat-msg--bot"><p>${esc(PANEL_GREETING)}</p></div>
  </div>
  <p class="chat__error" role="alert" hidden></p>
  <div class="chat-panel__foot">${form('chat-panel')}
  </div>
</aside>`
}
