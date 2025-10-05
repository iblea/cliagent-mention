# Cli-Agent

### Description

This vscode extension compares the relative path of the active terminal with the selected path in the editor to create mentions.

이 vscode 확장은 활성 터미널의 상대 경로와 에디터의 선택된 경로를 비교해 멘션을 걸어주는 확장입니다.

ex:
  - TerminalPath: /home/test/notepad/issue/
  - EditorPath: /home/test/project/source/dist/test.js
  -> @../../project/source/dist/test.js

If there is selected content, it additionally outputs the selected lines.
Since Claude Code and Codex have different cases in output, the method of outputting selected lines is different.

선택된 내용이 있으면 선택된 라인을 추가로 출력합니다. \
Claude Code와 Codex는 출력에 있어 다른 경우가 존재하므로, 선택된 라인을 출력하는 방법이 다릅니다.

- Codex: `@test.js:15-30`
- Claude Code: `@test.js#L15-30`

### Config

- `cliagent-mention.logLevel`: Log level Settings for debugging (default: `warn`)
  - trace
  - debug
  - info
  - warn
  - error
  - fatal
  - off

- `cliagent-mention.prefixString`: String setting to be attached before mention (default: `@`)
  - `#`: `#path/to/file`
- `cliagent-mention.suffixString`: String setting to be attached after mention (default: `:`)
  - `#L`: `@path/to/file#L15-30`
