const character = new ReactiveVar();
const complete = new ReactiveVar();
const label = new ReactiveVar();
const medians = new ReactiveVar();
const strokes = new ReactiveVar();
const zoom = new ReactiveVar(1);

let handwriting = null;

const kCanvasSize = 512;
const kFontSize = 1024;
const kMatchThreshold = -200;

let characters = [];
let definitions = {};
let offset = 1;

// A couple small utility functions for Euclidean geometry.

const fixMedianCoordinates = (median) => median.map((x) => [x[0], 900 - x[1]]);

const scale = (median, k) => median.map((point) => point.map((x) => k * x));

const advance = () => {
  offset = (offset + 1) % characters.length;
  character.set(characters[offset]);
}

const match = (stroke) => {
  let best_index = -1;
  let best_score = kMatchThreshold;
  const matcher = new makemeahanzi.Matcher([], {bounds: [[0, 0], [1, 1]]});
  for (let i = 0; i < medians.get().length; i++) {
    const score = matcher.score(stroke, medians.get()[i]);
    if (score > best_score) {
      best_index = i;
      best_score = score;
    }
  }
  return best_index;
}

// Event handlers which will be bound to various Meteor-dispatched events.

const onData = (data, code) => {
  if (code !== 'success') throw new Error(code);
  for (let line of data.split('\n')) {
    const terms = line.split('\t');
    if (terms.length < 4) continue;
    const character = terms[0][0];
    characters.push(character);
    definitions[character] = terms[3];
  }
  if (characters.length === 0) throw new Error(data);
  characters = _.shuffle(characters);
  advance();
}

const onRendered = function() {
  zoom.set(this.getZoom());
  const element = $(this.firstNode).find('.handwriting');
  handwriting = new makemeahanzi.Handwriting(element, onStroke, zoom.get());
}

const onStroke = (stroke) => {
  const scaled = scale(stroke, 1 / kCanvasSize);
  const index = match(scaled);
  if (index < 0) {
    handwriting.fade();
    return;
  }
  const current = complete.get();
  if (current[index]) {
    handwriting.undo();
    console.log(`Re-matched stroke ${index}.`);
    return;
  }
  current[index] = true;
  complete.set(current);
  handwriting.emplace(strokes.get()[index]);
  if (current.every((x) => x)) {
    console.log('Success!');
    handwriting.clear();
    advance();
  }
}

const updateCharacter = () => {
  makemeahanzi.lookupCharacter(character.get(), (row) => {
    if (row.character === character.get()) {
      const definition = definitions[row.character] || row.definition;
      complete.set(new Array(row.medians.length).fill(false));
      label.set(`${row.pinyin.join(', ')} - ${definition}`);
      medians.set(row.medians.map(fixMedianCoordinates)
                             .map((x) => scale(x, 1 / kFontSize)));
      strokes.set(row.strokes);
    }
  });
}

// Meteor template bindings.

$.get('radicals.txt', onData);

Template.teach.helpers({
  label: () => label.get(),
  zoom: () => zoom.get(),
});

Template.teach.onRendered(onRendered);

Meteor.startup(() => Deps.autorun(updateCharacter));
