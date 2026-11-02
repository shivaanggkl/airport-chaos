import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync('client/src/menu-card-carousel.ts','utf8');
const ast=ts.createSourceFile('menu-card-carousel.ts',source,ts.ScriptTarget.Latest,true);
const statements=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['setMenuCarouselArtwork','createMenuCarouselArtwork'].includes(node.name?.text??'')||ts.isVariableStatement(node)&&node.getText(ast).startsWith('const artworkBounds'));
const code=ts.transpileModule(statements.map(node=>node.getText(ast).replace(/^export /,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
class Element{
 style:Record<string,string>={};children:Element[]=[];src='';className='';textContent='';draggable=true;
 append(...nodes:Element[]){this.children.push(...nodes);}setAttribute(){}
}
test('common artwork renderer fills one frame and gives every hub card exactly one dynamic ribbon',()=>{
 for(const src of ['/media/hub/missions-card.jpg','/media/hub/free-fly-card.jpg','/media/multiplayer/air-assault-card.jpg','/media/multiplayer/sky-duel-card.png','/media/city-journey/dallas-card.png']){
  const context={document:{createElement:()=>new Element()},image:new Element(),visual:null as Element|null};
  runInNewContext(code+`\nvisual=createMenuCarouselArtwork(${JSON.stringify(src)},'test-image','SINGLE PLAYER');`,context);
  const visual=context.visual!,frame=visual.children[0],image=frame.children[0];
  assert.equal(visual.className,'menu-card-visual');assert.equal(frame.className,'menu-card-artwork');assert.equal(visual.children.length,2);assert.equal(visual.children[1].textContent,'SINGLE PLAYER');
  assert.equal(image.style.transform,'none');assert.equal(image.style.clipPath,'none');assert.equal(image.style.objectFit,'fill');
  assert.ok(parseFloat(image.style.width)>=100);assert.ok(parseFloat(image.style.height)>=100);
 }
});
test('changing city artwork resets old source bounds without adding another image or frame',()=>{
 const context={document:{createElement:()=>new Element()},image:new Element()};
 runInNewContext(code+"\nsetMenuCarouselArtwork(image,'/media/hub/free-fly-card.jpg');setMenuCarouselArtwork(image,'/media/city-journey/dallas-card.png');",context);
 assert.equal(context.image.style.left,'0%');assert.equal(context.image.style.top,'0%');assert.equal(context.image.style.width,'100%');assert.equal(context.image.style.height,'100%');
 const home=readFileSync('client/src/home-hangar.ts','utf8'),city=readFileSync('client/src/bootstrap.ts','utf8'),css=readFileSync('client/src/style.css','utf8');
 assert.match(home,/card.append\(createMenuCarouselArtwork/);assert.match(city,/card.append\(createMenuCarouselArtwork/);
 assert.doesNotMatch(css,/\.home-hangar-card-image\[src=/);
});
