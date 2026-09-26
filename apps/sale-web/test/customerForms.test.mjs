import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the actual forms with the catalog's paginated HTTP response shape.
// Only the resource hook and dialog shell are replaced; form rendering is unchanged.
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: `export { CustomerForm } from './src/sales/Customers'; export { ForecastEditor } from './src/sales/MyPipeline'; export { setCatalog } from 'fixture-resource';`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  plugins: [
    {
      name: 'form-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^(?:\.\/shared|fixture-resource)$/ }, () => ({
          path: 'resource',
          namespace: 'form-fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'form-fixture' }, () => ({
          loader: 'jsx',
          resolveDir: root,
          contents: `
      import React from 'react';
      let catalog = {data:null,loading:true,error:''};
      export function setCatalog(value){catalog=value;}
      export function useResource(path,revision,enabled=true){return enabled && path.startsWith('/catalog/products') ? catalog : {data:path==='/sales/regions'?[]:null,loading:false,error:''};}
      export function Modal({children}){return <section>{children}</section>;}
      export function Form({children}){return <form>{children}</form>;}
      export function State({error}){return error ? <p role="alert">{error}</p> : null;}
      export const Pager=()=>null; export const SearchBox=()=>null;
    `,
        }));
        builder.onLoad({ filter: /(?:Customers|MyPipeline)\.tsx$/ }, async (args) => ({
          loader: 'tsx',
          contents: (await readFile(args.path, 'utf8'))
            .replace('function CustomerForm(', 'export function CustomerForm(')
            .replace('function ForecastEditor(', 'export function ForecastEditor('),
        }));
      },
    },
  ],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const { CustomerForm, ForecastEditor, setCatalog } = compiled.exports;
const actor = { id: 'test', grants: [{ permission: 'catalog.products.read', scope: 'GLOBAL' }] };
const customer = {
  id: 'c',
  name: 'Shop kiểm thử',
  phone: '0900000000',
  address: 'Địa chỉ mẫu',
  status: 'CONSULTING',
  version: 2,
  expectedRevenue: '1000000',
  closingProbability: 50,
  effectiveProbability: 50,
  expectedItems: [],
  expectedProducts: ['Lụa'],
  tags: [],
  assignments: [],
};
const render = (Form) =>
  renderToStaticMarkup(React.createElement(Form, { customer, actor, close() {}, done() {} }));
for (const [name, Form] of [
  ['customer edit', CustomerForm],
  ['pipeline forecast', ForecastEditor],
]) {
  test(name + ' renders an API product page without a blank screen', () => {
    setCatalog({
      data: {
        items: [
          { id: 'p1', name: 'Lụa', isActive: true },
          { id: 'p2', name: 'Ngừng bán', isActive: false },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      },
      loading: false,
      error: '',
    });
    const html = render(Form);
    assert.match(html, /Lụa/);
    assert.doesNotMatch(html, /Ngừng bán/);
    assert.match(html, /form/);
  });
  test(name + ' remains usable while catalog loads, is empty or fails', () => {
    for (const state of [
      { data: null, loading: true, error: '' },
      { data: { items: [], total: 0, page: 1, pageSize: 20 }, loading: false, error: '' },
      { data: null, loading: false, error: 'Không tải được danh mục' },
    ]) {
      setCatalog(state);
      const html = render(Form);
      assert.match(html, /form/);
      if (state.error) assert.match(html, /Không tải được danh mục/);
    }
  });
}
