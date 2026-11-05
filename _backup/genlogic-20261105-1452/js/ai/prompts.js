/* Prompts. The model is an editor, not an author: it never learns facts it was
   not given, and it never touches layout. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.AI = M.AI || {};

  var STYLE_BRIEF = {
    poetic: '诗意、含蓄。句子短，留白多，不解释照片。可以用光和时间的比喻，但不堆形容词。',
    documentary: '纪实。像旁白或画册说明：具体、克制、可核对。优先写动作和物件，不写心情。',
    minimal: '极简。标题 2–4 个字，句子不超过 12 个字。能删就删，宁可少说。',
    playful: '轻松有趣。口语，可以有小小的幽默或自嘲，但不油滑，不用感叹号连发。',
    personal: '私人日记。第一人称，像写给自己的备忘，允许不完整、停顿、不确定。',
    none: '不要任何内容文字。'
  };

  function systemPrompt() {
    return [
      '你是一位摄影书的文字编辑，为一个本地照片排版工具提供文字灵感。',
      '你只写文字内容，绝不写 HTML、CSS、坐标、字号、字体或任何排版指令。',
      '事实纪律（最重要）：',
      '1. 只能使用用户给出的「事实」里的信息。没有给的地点、日期、人物、事件，一律不许编。',
      '2. 不知道就写得模糊（例如「那天」「这里」），不要猜具体地名或时间。',
      '3. 不许虚构人物关系、对白、行程。',
      '4. 用户写的「我的记忆」是权威事实，你的文字不能改变它的意思，只能换一种说法。',
      '5. 三个方向必须真的不同：不同的情绪、不同的叙述视角、不同的句子长度，不是同义词替换。',
      '输出：严格按给定的 JSON Schema，只输出 JSON，不要任何解释。'
    ].join('\n');
  }

  function briefText(brief) {
    var lines = [];
    lines.push('照片数量：' + brief.count + ' 张');
    if (brief.aspect) lines.push('画幅：竖 ' + brief.aspect.portrait + ' / 横 ' + brief.aspect.landscape + ' / 方 ' + brief.aspect.square);
    if (brief.palette && brief.palette.length) {
      lines.push('色彩（由照片取样得出）：' + brief.palette.map(function (p) { return p; }).join('、'));
    }
    lines.push('明暗：' + brief.tone);
    if (brief.dates) lines.push('拍摄时间范围（来自文件元数据）：' + brief.dates);
    else lines.push('拍摄时间：未知（不要写具体日期）');
    if (brief.places) lines.push('地点（来自文件元数据）：' + brief.places);
    else lines.push('地点：未知（不要写具体地名）');
    if (brief.userMemory) lines.push('用户自己的记忆（权威，不许改写含义）：' + brief.userMemory);
    if (brief.userEdited && brief.userEdited.length) {
      lines.push('用户已经亲手写过的文字（不要覆盖，也不要改动它们的意思）：');
      brief.userEdited.forEach(function (t) { lines.push('- [' + t.role + '] ' + t.text); });
    }
    if (brief.bookTitle) lines.push('当前书名：' + brief.bookTitle);
    lines.push('文字风格要求：' + (STYLE_BRIEF[brief.style] || STYLE_BRIEF.poetic));
    lines.push('需要的密度：' + (brief.density || 'low'));
    return lines.join('\n');
  }

  /* three angles that cannot collapse into each other:
     one is about time, one is about objects, one is about the person writing. */
  var ANGLES = [
    {
      key: 'time',
      name: '时间／纪实',
      ask: '以「时间的推进」为主轴。写具体发生过什么、顺序、天气、光线变化。视角像第三方旁白，不写内心。' +
           '句子中等长度，可以出现钟点、天色的词（但只能用给到的日期；没给就写「早上/傍晚」这种。）'
    },
    {
      key: 'objects',
      name: '物件／静物',
      ask: '只写照片里能看见的东西：物件、材质、颜色、距离、位置。几乎不写人，也不写情绪。' +
           '短句，名词为主，像展签。标题要具体到某个物或某个动作。'
    },
    {
      key: 'voice',
      name: '第一人称／私语',
      ask: '第一人称写给自己的备忘。允许犹豫、停顿、说漏嘴，允许不完整。' +
           '只写感受和当时的想法，不复述画面。句子长短不齐，可以只有两三个字。'
    }
  ];

  function anglePrompt(brief, angle) {
    return [
      '这次只写一个方向，严格遵守下面的编辑角度：',
      angle.ask,
      '',
      briefText(brief),
      '',
      '硬性要求：',
      '- 不要复用「当前书名」里的任何字词（如果有给）。',
      '- 不要出现「光影交错 / 时光流转 / 岁月静好」这类套话，也不要写「如同一首」「仿佛」开头的比喻。',
      '- captions 里的每一条都必须是独立的一句，不能是同义改写。',
      '- 只输出一个方向：{"directions":[ <一个方向> ]}'
    ].join('\n');
  }

  function userPrompt(brief) {
    return [
      '下面是一次要配文字的摄影书。请给出 3 个明显不同的编辑方向。',
      '',
      briefText(brief),
      '',
      '每个方向给出：title（书名，20 字内）、subtitle（副标题，30 字内）、concept（一句编辑概念，60 字内）、',
      'mood（2–3 个情绪词）、writingStyle（一句话描述语气）、chapterTitles（3–6 个章节词，每个 2–4 字）、',
      'captions（6–10 条短句，每条 30 字内，role 用 short_caption）、textDensity（none/low/medium/high）。',
      '注意：captions 的数量不要超过照片数量。'
    ].join('\n');
  }

  /* when there is no model at hand: templates that only use what we truly know */
  function fallbackDirections(brief) {
    var n = brief.count;
    var dateish = brief.dates || '';
    var base = [
      {
        id: 'poetic', title: '光停留的地方', subtitle: '一本关于 ' + n + ' 个瞬间的小书',
        concept: '把一次出行写成几段安静的光。', mood: ['warm', 'quiet'],
        writingStyle: '诗意、短句', chapterTitles: ['光', '风', '途中'],
        captions: ['光落在没有人的地方。', '风把下午吹薄了一点。', '我没有拍下声音。', '有些东西只出现过一次。'],
        textDensity: 'low'
      },
      {
        id: 'documentary', title: n + ' 个片段', subtitle: dateish || '按拍摄顺序',
        concept: '不加修饰地按顺序记录这一次。', mood: ['plain', 'steady'],
        writingStyle: '纪实、具体', chapterTitles: ['出发', '现场', '离开'],
        captions: ['第一张是从窗口拍的。', '这一张里有人在等。', '最后拍的是脚下的地。', '回程时天已经暗了。'],
        textDensity: 'medium'
      },
      {
        id: 'minimal', title: '记', subtitle: '',
        concept: '只留下必要的字。', mood: ['clean'],
        writingStyle: '极简', chapterTitles: ['一', '二', '三'],
        captions: ['这里。', '后来。', '没有别的话。'],
        textDensity: 'low'
      }
    ];
    if (brief.userMemory) {
      base[2].captions = [brief.userMemory.slice(0, 30)];
    }
    return base;
  }

  M.AI.prompts = {
    ANGLES: ANGLES,
    anglePrompt: anglePrompt,
    STYLE_BRIEF: STYLE_BRIEF,
    system: systemPrompt,
    user: userPrompt,
    briefText: briefText,
    fallback: fallbackDirections
  };
})(window.MEM);
