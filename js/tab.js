/**
 * sets up tab controls
 */

var TABS = (function(){

    var TABS = [];

    $(function(){
        //setup any exsisting tabs
        $('.TAB_container').each(function(i,e){
            setupTab(e);
        });

        //setup any future tabs
        $(document).bind('DOMNodeInserted', function(e) {
            if($(e.target).is('.TAB_container')){
                setupTab(e.target);
            }
        });
    });

    /**
     * setup the listeners and initialize the tab control
     */
    function setupTab(element){
        var tab_root = getTabRoot(element);
        var default_page = getDefaultPage(tab_root);
        TABS.push({
            root:tab_root[0],
            active_tab:null
        });
        showPage(tab_root, default_page);
        //setup listeners on the buttons
        tab_root.find('.TAB_button').on('click',tabButtonClicked);
        UI.pushState(default_page);
    }

    /**
     * get the main tab container element for the passed element
     * @param {Element} element - the element we want the associated tab for
     */
    function getTabRoot(element){
        return $(element).closest('.TAB_container');
    }

    /**
     * show the given tab page for the given tab container
     * @param {Element} element - the tab root element we want to show a page on
     * @param {String} page - name of the page to show, this is defined in the data-tab_page attribute
     */
    function showPage(element, page){
        var tab_root = getTabRoot(element);
        //hide all pages
        tab_root.find('[data-tab_page].TAB_page').removeClass('TAB_selected');
        //show the page we want
        tab_root.find('[data-tab_page='+page+'].TAB_page').addClass('TAB_selected');
        //unmark selection on all buttons
        tab_root.find('[data-tab_page].TAB_button').removeClass('TAB_selected');
        //mark selection on the one button that is now selected
        tab_root.find('[data-tab_page='+page+'].TAB_button').addClass('TAB_selected');
        for(var i = 0; i<TABS.length; i++){
            if(TABS[i].root === element[0]){
                TABS[i].active_tab = page;
                break;
            }
        }
    }

    /**
     * for the given tab container return it's default page
     * @param {Element} element - the element we want the associated tab for
     */
    function getDefaultPage(element){
        var default_page = $(element).find('[data-tab_page].TAB_default');
        if(default_page.length === 0){
            var default_page = $(element).find('[data-tab_page]');

            //if we still don't have it something is wrong
            if(default_page.length === 0){
                throw new Error('No pages for give tab');
            }
        }

        return default_page.data('tab_page');
    }

    /**
     * called when a tab button is clicked
     * shows the associated tab page
     * @param {Event} event - the onclick event
     */
    function tabButtonClicked(event){
        var page = $(event.currentTarget).data('tab_page');
        var tab_root = getTabRoot(event.currentTarget);
        showPage(tab_root, page);
        UI.pushState(page);
    }

    return {
        showPage:function(tab_root, page){
            showPage($(tab_root), page);
            UI.pushState(page);
        },
        getActiveTabs:function(){
            var out = [];
            for(var i = 0; i<TABS.length; i++){
                var tab = TABS[i];
                out.push({
                    root:tab.root,
                    active_tab:tab.active_tab
                });
            }
            return out;
        },
        setActiveTabs:function(tabs){
            for(var i = 0; i<tabs.length; i++){
                var tab = tabs[i];
                showPage(tab.root, tab.active_tab);
            }
        }
    };
})();
