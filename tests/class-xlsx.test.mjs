import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassScoreXlsx, serializeClassScoreCsv, createClassScoreExport} from '../src/class-xlsx.mjs';

const matrix={headers:['学号','姓名','通过题数','尝试题数','A · 题名'],rows:[['001','=测试,"姓名"\r\n第二行',1,2,'AC'],['002','普通 & <文本>',0,0,'未尝试']]};

// Read ZIP directory offsets independently; text merely appearing in the archive is insufficient.
function unzipStored(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), end=bytes.length-22;
  assert.equal(view.getUint32(end,true),0x06054b50);
  const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), result=new Map();
  assert.equal(view.getUint16(end+8,true),count);
  assert.equal(start+view.getUint32(end+12,true),end);
  let pos=start, nextLocal=0;
  for(let i=0;i<count;i++){
    assert.equal(view.getUint32(pos,true),0x02014b50);
    assert.equal(view.getUint16(pos+10,true),0); // stored, no compression dependency
    const size=view.getUint32(pos+24,true), nameLength=view.getUint16(pos+28,true), offset=view.getUint32(pos+42,true);
    assert.equal(view.getUint32(pos+20,true),size);
    const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLength));
    assert.equal(offset,nextLocal);
    assert.equal(view.getUint32(offset,true),0x04034b50);
    assert.equal(view.getUint32(offset+14,true),view.getUint32(pos+16,true)); // CRC in both records
    assert.equal(view.getUint32(offset+18,true),size);
    assert.equal(view.getUint32(offset+22,true),size);
    assert.equal(view.getUint16(offset+26,true),nameLength);
    assert.equal(new TextDecoder().decode(bytes.subarray(offset+30,offset+30+nameLength)),name);
    const dataStart=offset+30+nameLength+view.getUint16(offset+28,true);
    result.set(name,new TextDecoder().decode(bytes.subarray(dataStart,dataStart+size)));
    nextLocal=dataStart+size;
    pos+=46+nameLength+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
  assert.equal(nextLocal,start);
  assert.equal(pos,end);
  return result;
}

test('score CSV preserves BOM, CRLF, quoted commas, quotes, newlines and leading-zero identifiers',async()=>{
  const csv=serializeClassScoreCsv(matrix);
  assert.equal(csv,'\ufeff"学号","姓名","通过题数","尝试题数","A · 题名"\r\n'+
    '"001","\'=测试,""姓名""\r\n第二行","1","2","AC"\r\n'+
    '"002","普通 & <文本>","0","0","未尝试"');
  const {blob}=createClassScoreExport(matrix,'班级','比赛','csv');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0,3)],[0xef,0xbb,0xbf]);
});

test('CSV escapes formula prefixes and preserves identifier characters in the file',()=>{
  for(const name of ['=1+1','+1','-1','@SUM(A1)','\t=1','\r=1','\n=1','  =1']){
    const csv=serializeClassScoreCsv({headers:['学号','姓名'],rows:[['0001234567890123456789',name]]});
    assert.ok(csv.endsWith(`"0001234567890123456789","'${name}"`));
  }
  assert.ok(serializeClassScoreCsv({headers:['学号','姓名'],rows:[['123E4','常规']]}).endsWith('"123E4","常规"'));
});

test('XLSX ZIP records, OOXML relationships, text cells and numeric counts are valid',()=>{
  const entries=unzipStored(createClassScoreXlsx(matrix));
  assert.deepEqual([...entries.keys()],['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml']);
  assert.match(entries.get('[Content_Types].xml'),/PartName="\/xl\/worksheets\/sheet1.xml"/);
  assert.match(entries.get('_rels/.rels'),/Target="xl\/workbook.xml"/);
  assert.match(entries.get('xl/workbook.xml'),/name="比赛成绩" sheetId="1" r:id="rId1"/);
  assert.match(entries.get('xl/_rels/workbook.xml.rels'),/Id="rId1"[^>]*Target="worksheets\/sheet1.xml"/);
  const xml=entries.get('xl/worksheets/sheet1.xml');
  assert.match(xml,/r="A2" t="inlineStr"><is><t xml:space="preserve">001<\/t>/);
  assert.match(xml,/r="B2" t="inlineStr"><is><t xml:space="preserve">=测试,&quot;姓名&quot;&#13;\n第二行/);
  assert.match(xml,/普通 &amp; &lt;文本&gt;/);
  assert.match(xml,/r="C2" t="n"><v>1<\/v>/);
  assert.match(xml,/r="D3" t="n"><v>0<\/v>/);
  assert.match(xml,/r="E3" t="inlineStr"><is><t xml:space="preserve">未尝试/);
  assert.doesNotMatch(xml,/<f[ >]/);
});

test('XLSX addresses columns beyond Z and replaces XML-disallowed control characters',()=>{
  const entries=unzipStored(createClassScoreXlsx({headers:Array(28).fill('题名'),rows:[...matrix.rows,['003','姓名\u0000\u000b',0,0]]}));
  const xml=entries.get('xl/worksheets/sheet1.xml');
  assert.match(xml,/dimension ref="A1:AB4"/);
  assert.match(xml,/r="AA1" t="inlineStr"/);
  assert.match(xml,/r="AB1" t="inlineStr"/);
  assert.match(xml,/姓名\ufffd\ufffd/);
  assert.doesNotMatch(xml,/[\u0000\u000b]/);
});

test('score download defaults to XLSX and sanitizes filenames with matching MIME and extension',async()=>{
  const xlsx=createClassScoreExport(matrix,' 合成/班级 ','比赛:一?');
  assert.equal(xlsx.filename,'合成_班级-比赛_一_-成绩.xlsx');
  assert.equal(xlsx.blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(unzipStored(new Uint8Array(await xlsx.blob.arrayBuffer())).has('xl/workbook.xml'));
  const csv=createClassScoreExport(matrix,'班\n级','比赛','csv');
  assert.equal(csv.filename,'班_级-比赛-成绩.csv');
  assert.equal(csv.blob.type,'text/csv;charset=utf-8');
  assert.equal(createClassScoreExport(matrix,'','').filename,'未命名-未命名-成绩.xlsx');
  assert.throws(()=>createClassScoreExport(matrix,'班级','比赛','exe'),/不支持/);
});
