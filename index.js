var lunr = require('lunr');
var Entities = require('html-entities').AllHtmlEntities;

var Html = new Entities();

var searchIndex;
// Called with the `this` context provided by Gitbook
function getSearchIndex(context) {
    if (!searchIndex) {
        // Create search index
        var ignoreSpecialCharacters = context.config.get('pluginsConfig.searchLanguages.ignoreSpecialCharacters')
                                      || context.config.get('searchLanguages.ignoreSpecialCharacters');
        var lang = context.config.get('pluginsConfig.searchLanguages.lang');
        if (lang) {
            require('lunr-languages/lunr.stemmer.support.js')(lunr);
            if (lang === 'jp') {
                require('lunr-languages/tinyseg.js')(lunr);
            }
            require('lunr-languages/lunr.' + lang + '.js')(lunr);
        }
        searchIndex = lunr(function () {
            if (lang) {
                this.use(lunr[lang]);
            }
            this.ref('url');

            this.field('title', { boost: 10 });
            this.field('keywords', { boost: 15 });
            this.field('body');

            if (!ignoreSpecialCharacters) {
                // Don't trim non words characters (to allow search such as "C++")
                this.pipeline.remove(lunr.trimmer);
            }
        });
    }
    return searchIndex;
}

// Map of Lunr ref to document
var documentsStore = {};

var searchIndexEnabled = true;
var indexSize = 0;

module.exports = {
    book: {
        assets: './assets',
        js: [ 'lunr.min.js', 'lunr-languages.min.js', 'search-lunr.js' ]
    },

    hooks: {
        "init": function() {
        },
        // Index each page
        'page': function(page) {
            if (this.output.name != 'website' || !searchIndexEnabled || page.search === false) {
                return page;
            }

            var text, maxIndexSize;
            maxIndexSize = this.config.get('pluginsConfig.searchLanguages.maxIndexSize')
                                            || this.config.get('searchLanguages.maxIndexSize');

            this.log.debug.ln('index page', page.path);

            text = page.content;
            // Decode HTML
            text = Html.decode(text);
            // Strip HTML tags
            text = text.replace(/(<([^>]+)>)/ig, '');

            indexSize = indexSize + text.length;
            if (indexSize > maxIndexSize) {
                this.log.warn.ln('search index is too big, indexing is now disabled');
                searchIndexEnabled = false;
                return page;
            }

            var keywords = [];
            if (page.search) {
                keywords = page.search.keywords || [];
            }

            // Add to index
            var doc = {
                url: this.output.toURL(page.path),
                title: page.title,
                summary: page.description,
                keywords: keywords.join(' '),
                body: text
            };

            documentsStore[doc.url] = doc;
            getSearchIndex(this).add(doc);

            return page;
        },

        // Write index to disk
        'finish': function() {
            if (this.output.name != 'website') return;

            this.log.debug.ln('write search index');
            return this.output.writeFile('search_index.json', JSON.stringify({
                index: getSearchIndex(this),
                store: documentsStore
            }));
        }
    }
};
