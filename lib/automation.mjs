import {z} from 'zod';

export const operations = {
  open: 'Open page', click: 'Click', fill: 'Enter text', press: 'Press key',
  doubleClick: 'Double-click', hover: 'Hover', scroll: 'Scroll to element', focus: 'Focus element',
  select: 'Select dropdown option', check: 'Check checkbox', uncheck: 'Uncheck checkbox',
  drag: 'Drag and drop', reload: 'Reload page', back: 'Go back', forward: 'Go forward',
  visible: 'Check visible', text: 'Check text', url: 'Check URL',
  hidden: 'Check hidden', value: 'Check field value', checked: 'Check checked',
  unchecked: 'Check unchecked', enabled: 'Check enabled', disabled: 'Check disabled',
  count: 'Check item count', title: 'Check page title', attribute: 'Check attribute',
};
export const assertions = new Set(['visible','hidden','text','url','value','checked','unchecked','enabled','disabled','count','title','attribute']);
export const pageActions = new Set(['open','reload','back','forward','url','title']);
export const keys = ['Enter','Tab','Escape','Space','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Backspace','Delete','ControlOrMeta+a','Shift+Tab'];
export const valueLabels = {
  open:'Page path', fill:'Text to enter', press:'Key', select:'Option value',
  drag:'Destination selector', text:'Expected text', url:'URL contains',
  value:'Expected field value', count:'Expected item count', title:'Title contains', attribute:'Expected attribute value',
};
export const maxSteps = 40;
const target = z.string().trim().min(1).max(300);
const value = z.string().max(500);
const attribute = z.string().trim().regex(/^[a-zA-Z_][\w:.-]{0,79}$/);
export const planSchema = z.object({
  origin: z.string().url().max(300).refine(input => {
    const url = new URL(input);
    return url.protocol === 'https:' && url.origin === input && !url.port;
  }, 'Enter an HTTPS origin, for example https://example.com.'),
  viewport: z.enum(['desktop','mobile']),
  steps: z.array(z.discriminatedUnion('action', [
    z.object({action:z.literal('open'), value:z.string().min(1).max(500).regex(/^\/(?![\/\\])/)}).strict(),
    z.object({action:z.literal('click'), target}).strict(),
    z.object({action:z.literal('doubleClick'), target}).strict(),
    z.object({action:z.literal('hover'), target}).strict(),
    z.object({action:z.literal('scroll'), target}).strict(),
    z.object({action:z.literal('focus'), target}).strict(),
    z.object({action:z.literal('select'), target, value:value.min(1)}).strict(),
    z.object({action:z.literal('check'), target}).strict(),
    z.object({action:z.literal('uncheck'), target}).strict(),
    z.object({action:z.literal('drag'), target, value:target}).strict(),
    z.object({action:z.literal('reload')}).strict(),
    z.object({action:z.literal('back')}).strict(),
    z.object({action:z.literal('forward')}).strict(),
    z.object({action:z.literal('fill'), target, value}).strict(),
    z.object({action:z.literal('press'), target, value:z.enum(keys)}).strict(),
    z.object({action:z.literal('visible'), target}).strict(),
    z.object({action:z.literal('text'), target, value:value.min(1)}).strict(),
    z.object({action:z.literal('url'), value:value.min(1)}).strict(),
    z.object({action:z.literal('hidden'), target}).strict(),
    z.object({action:z.literal('value'), target, value}).strict(),
    z.object({action:z.literal('checked'), target}).strict(),
    z.object({action:z.literal('unchecked'), target}).strict(),
    z.object({action:z.literal('enabled'), target}).strict(),
    z.object({action:z.literal('disabled'), target}).strict(),
    z.object({action:z.literal('count'), target, value:z.string().regex(/^(0|[1-9][0-9]{0,4})$/)}).strict(),
    z.object({action:z.literal('title'), value:value.min(1)}).strict(),
    z.object({action:z.literal('attribute'), target, name:attribute, value}).strict(),
  ])).min(2).max(maxSteps),
}).strict().superRefine((plan,ctx) => {
  if (plan.steps[0].action !== 'open' || !plan.steps.some(s => assertions.has(s.action))) {
    ctx.addIssue({code:'custom',message:'Start by opening a page and include at least one check.'});
  }
});
