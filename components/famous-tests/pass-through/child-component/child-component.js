BEST.module('famous-tests:pass-through:child-component', {
    behaviors: {
        '#el' : {
            size: [400, 100],
            style : {
                'background-color' : 'whitesmoke',
                'padding': '15px'
            }
        }
    },
    events: {
        '$pass-through' : {
            '#view' : ['position'],
            '#el' : ['content']
        }
    },
    states: {
    },
    tree: 'child-component.jade'
});
