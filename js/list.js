/**
 * sets up list controls. List controls are song/directory lists for representing MPD's Queue, Playlist, and search results
 */
(function(){
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

        //now add a bunch of methods to it
        contents.setItems = function(items){
            $(contents).find('.LIST_contents').empty();
            if(items.length < 1){
                $(contents).find('.LIST_empty').addClass('LIST_is_actually_empty');
            }
            else{
                $(contents).find('.LIST_empty').removeClass('LIST_is_actually_empty');
                items.forEach(function(item){
                    var item_content = item.getItemUI();
                    $(contents).find('.LIST_contents').append(item_content);
                });
            }
        };

        $(contents).attr('class', $(contents).attr('class')+' '+classes);

        //replace the place holder
        $(element).replaceWith($(contents));
    }
})();
