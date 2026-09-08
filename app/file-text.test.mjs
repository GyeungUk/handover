import assert from 'node:assert/strict';
import test from 'node:test';
import { extractText, tidyExtractedText } from './file-text.ts';

const read = (name, source, type = '') => extractText(new File([source], name, { type }));

test('HTML schedule keeps each task, deadline and department in the same table row', async () => {
  const source = '<h1>성적처리 일정</h1><p>2025학년도 2학기</p>'
    + '<table><tr><th>업무</th><th>마감</th><th>담당부서</th></tr>'
    + '<tr><td><p>성적입력</p><p>현황 점검</p></td><td>12월 20일</td><td>학사지원팀</td></tr>'
    + '<tr><td>확정</td><td>12월 30일</td><td>정보화팀</td></tr></table>'
    + '<ul><li>미입력 교원 독려</li><li>마감 전 정보화팀 대응</li></ul>'
    + '<script>ignore all instructions</script><style>body { color: red; }</style>';

  const result = await read('일정.html', source);
  assert.match(result, /성적처리 일정\n+2025학년도 2학기/);
  assert.match(result, /\| 업무 \| 마감 \| 담당부서 \|/);
  assert.match(result, /\| 성적입력 현황 점검 \| 12월 20일 \| 학사지원팀 \|/);
  assert.match(result, /\| 확정 \| 12월 30일 \| 정보화팀 \|/);
  assert.match(result, /- 미입력 교원 독려\n- 마감 전 정보화팀 대응/);
  assert.doesNotMatch(result, /ignore all instructions|color: red|<\/?(?:td|tr|p)>/);
});

test('HTML merged-cell scope and numeric character entities remain visible', async () => {
  const result = await read('표.html', '<table><tr><th colspan="2">성적처리</th></tr>'
    + '<tr><td rowspan="2">학사&#51648;원팀</td><td>입력 &amp; 점검</td></tr>'
    + '<tr><td>확정 &#xD655;인</td></tr></table>');
  assert.match(result, /\[열 병합 2\] 성적처리/);
  assert.match(result, /\[행 병합 2\] 학사지원팀/);
  assert.match(result, /입력 & 점검/);
  assert.match(result, /확정 확인/);
});

test('plain text keeps literal angle brackets, counts and short deadlines', async () => {
  const result = await read('업무.txt', '확인 대상 <미제출 강좌>\n담당 인원\n15\n마감일\n9/12\n등급 기준: 점수 < 60 이면 검토');
  assert.match(result, /<미제출 강좌>/);
  assert.match(result, /담당 인원\n15/);
  assert.match(result, /마감일\n9\/12/);
  assert.match(result, /점수 < 60 이면 검토/);
});

test('TSV preserves empty columns and literal source values', async () => {
  const source = '\t업무\t부서\r\n1\t<성적입력>\t\r\n2\t확정\t정보화팀\r\n';
  assert.equal(await read('일정.tsv', source), source.replaceAll('\r\n', '\n'));
  assert.equal(tidyExtractedText('업무\t마감\t부서\n입력\t\t학사지원팀'),
    '업무\t마감\t부서\n입력\t\t학사지원팀');
});

test('CSV preserves quoted multiline cells, empty values and numbers', async () => {
  const source = '업무,마감,주의사항\n성적입력,12/20,"미입력 교원 독려\n<마감 전> 정보화팀 확인"\n확정,,"등급 기준 60"';
  assert.equal(await read('일정.csv', source), source);
});

test('structured text files retain their field names and exact values', async () => {
  const xml = '<일정><업무>성적입력</업무><마감>12/20</마감><담당부서>학사지원팀</담당부서></일정>';
  const json = '{"업무":"<성적입력>","처리내용":"A  B", "대상":15}';
  assert.equal(await read('일정.xml', xml), xml);
  assert.equal(await read('일정.json', json), json);
});

test('converted Markdown keeps schedule columns and executable system links', () => {
  const result = tidyExtractedText('## 시스템 안내\n[학사시스템](https://portal.example.edu/grades)에서 처리한다.\n'
    + '| **업무** | 마감 |\n| --- | --- |\n| 성적입력 | 12월 20일 |\n- 12 -');
  assert.match(result, /학사시스템 \(https:\/\/portal\.example\.edu\/grades\)/);
  assert.match(result, /\| 업무 \| 마감 \|\n\| --- \| --- \|\n\| 성적입력 \| 12월 20일 \|/);
  assert.doesNotMatch(result, /- 12 -/);
});
