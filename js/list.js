/**
 * sets up list controls. List controls are song/directory lists for representing MPD's Queue, Playlist, and search results
 */
(function(){

    /**
     * @var int - number of UI elements to display at a time
     */
    var UPDATE_BATCH = 32;

    /*
     * automatic setup
     */
    $(function(){
        //setup any exsisting lists
        $('.LIST').each(function(i,e){setupList(e)});

        //setup any future lists
        $(document).bind('DOMNodeInserted', function(e) {
            if($(e.target).is('.LIST')){
                setupList(e.target);
            }
        });
    });

    /**
     * given an element make it into a list control
     */
    function setupList(element){

        var classes = $(element).attr('class').replace(/\s*LIST\s*/g, ' ');
        var header = $(element).find('.LIST_header');
        var empty = $(element).find('.LIST_empty');

        //we want the raw element, not the jquery wrapper
        var contents = $($('#template_LIST').html())[0];

        //if there is a header replace the template one with it
        $(contents).find('.LIST_header').replaceWith(header);
        $(contents).find('.LIST_empty').replaceWith(empty);

        /**
         *@var timer - timer handle for the next time we add elements to the list. null means we are not adding
         */
        contents.update_timer = null;

        //now add a bunch of methods to it
        contents.setItems = function(items){
            //if we are in the middle of updating something else stop that
            if(contents.update_timer){
                clearTimeout(contents.update_timer);
                contents.update_timer = null;
            }
            //clear what ever is there already
            $(contents).find('.LIST_contents').empty();
            //if we are adding a whole lot of nothing have the UI relfect this
            if(items.length < 1){
                $(contents).find('.LIST_empty').addClass('LIST_is_actually_empty');
            }
            else{
                //the expected case of us adding a bunch of stuff
                //don't have the UI say there is nothing
                $(contents).find('.LIST_empty').removeClass('LIST_is_actually_empty');
                //setup an interval for adding stuff, one huge monolithic add is unresponsive for long lists of things
                var count = 0;//which timer iteration are we on
                contents.update_timer = setInterval(function(){
                    for(var i = 0; i<UPDATE_BATCH; i++){
                        //for however many items we are doing per-update add stuff
                        var offset = count*UPDATE_BATCH+i;     //get which item we are on
                        if(offset < items.length){
                            //as long as we haven't gone off the end of the list
                            var item = items[count*UPDATE_BATCH+i];     //get the item
                            var item_content = item.getItemUI();        //add it
                            $(contents).find('.LIST_contents').append(item_content);
                        }
                        else{
                            //if we have gone off the end of the list stop doing stuff
                            clearTimeout(contents.update_timer);
                            contents.update_timer = null;
                            return;
                        }
                    }
                    count++;
                }, 100);
            }
        };

        $(contents).attr('class', $(contents).attr('class')+' '+classes);

        //replace the place holder
        $(element).replaceWith($(contents));
    }
})();
