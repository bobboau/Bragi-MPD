var UI = (function(){

    /**
     * mapping between html classnames and MPD client methods to call to update them
     */

    var UI = {
        client: null,
        onChange:{
            state:[],
            queue:[],
            playlist:[]
        }
    };

    /********\
    |* INIT *|
    \********/

    $(function(){
        overrideMpd();

        UI.client = MPD(8800);

        UI.client.on('StateChanged',updateState);

        UI.client.on('QueueChanged',updateQueue);

        UI.client.on('PlaylistsChanged',updatePlaylists);

        var loaded = false;
        UI.client.on('DataLoaded',function(){
            if(!loaded){
                loaded = true;
                setTimeout(function(){
                    //manually make the file root
                    var element = $('.MPD_file_placeholder');
                    var contents = $($('#template_LIST_directory').html());
                    element.replaceWith(contents);

                    //populate the file root
                    var root = $('[data-tab_page=files] .LIST_directory');
                    populateFileList(root);
                    //the root is treated differently than the rest of the oflders
                    //you can't close it and it shouldn't have the common tools
                    //because 'add all music' is a sort of dangerous button on root
                    root.addClass('expanded root');
                    root.find('.LIST_directory_path').html('Music Files');
                    root.find('.MPD_button').remove();
                    resetSearch(null, true);
                }, 100);
            }
        });


        setInterval(function(){
            updatePlaytime(UI.client);
        },150);

        setInterval(function(){
            updatePageTitle(UI.client);
        },250);

        //setup event handlers for marque elements
        setupMarque();
    });

    /*******************\
    |* private methods *|
    \*******************/

    /**
     * override a few of the MPD classes to add some additional functionality to them
     */
    function overrideMpd(){
        //override the default MPD Song class to add some methods to it
        var OrigonalSong = MPD.Song;
        MPD.Song = function(client, source){
            var me = OrigonalSong(client, source);

            /**
             * get a DOM subtree for this song
             */
            me.getItemUI = function(template_id){
                if(typeof template_id === 'undefined'){
                    template_id = 'template_LIST_song';
                }
                var contents = $($('#'+template_id).html());
                contents.find('.LIST_song_title').html(me.getDisplayName());
                contents.find('.LIST_song_artist').html(me.getArtist());
                contents.find('.LIST_song_album').html(me.getAlbum());
                contents.find('.LIST_song_genre').html(me.getGenre());
                contents.find('.LIST_song_path').html(me.getPath());
                contents.find('.LIST_song_track').html(me.getTrack());
                contents.find('.LIST_song_disk').html(me.getDisk());
                contents.find('.LIST_song_duration').html(formatTime(me.getDuration()));
                return contents;
            }

            return me;
        }

        //override the default MPD Song class to add some methods to it
        var OrigonalQueueSong = MPD.QueueSong;
        MPD.QueueSong = function(client, source){
            var me = OrigonalQueueSong(client, source);

            /**
             * get a DOM subtree for this song
             */
            var getItemUI = me.getItemUI;
            me.getItemUI = function(template_id){
                if(typeof template_id === 'undefined'){
                    template_id = 'template_LIST_queue_song';
                }
                var contents = getItemUI(template_id);
                contents.attr('data-mpd_queue_song_id', me.getId());
                return contents;
            }

            return me;
        }

        //override the default MPD Song class to add some methods to it
        var OrigonalPlaylistSong = MPD.PlaylistSong;
        MPD.PlaylistSong = function(client, source){
            var me = OrigonalPlaylistSong(client, source);

            /**
             * get a DOM subtree for this song
             */
            var getItemUI = me.getItemUI;
            me.getItemUI = function(template_id){
                if(typeof template_id === 'undefined'){
                    template_id = 'template_LIST_playlist_song';
                }
                var contents = getItemUI(template_id);
                contents.attr('data-mpd_file_name', me.getPath());
                return contents;
            }

            return me;
        }

        //override the default MPD Song class to add some methods to it
        var OrigonalFileSong = MPD.FileSong;
        MPD.FileSong = function(client, source){
            var me = OrigonalFileSong(client, source);

            /**
             * get a DOM subtree for this song
             */
            var getItemUI = me.getItemUI;
            me.getItemUI = function(template_id){
                if(typeof template_id === 'undefined'){
                    template_id = 'template_LIST_file_song';
                }
                var contents = getItemUI(template_id);
                contents.attr('data-mpd_file_name', me.getPath());
                return contents;
            }

            return me;
        }

        //override the default MPD Song class to add some methods to it
        var OrigonalSearchSong = MPD.SearchSong;
        MPD.SearchSong = function(client, source){
            var me = OrigonalSearchSong(client, source);

            /**
             * get a DOM subtree for this song
             */
            var getItemUI = me.getItemUI;
            me.getItemUI = function(template_id){
                if(typeof template_id === 'undefined'){
                    template_id = 'template_LIST_file_song';
                }
                var contents = getItemUI(template_id);
                contents.attr('data-mpd_file_name', me.getPath());
                return contents;
            }

            return me;
        }

        //override the default MPD directory class to add some methods to it
        var OrigonalDirectory = MPD.Directory;
        MPD.Directory = function(client, source){
            var me = OrigonalDirectory(client, source);

            /**
             * get a DOM subtree for this directory
             */
            me.getItemUI = function(){
                var contents = $($('#template_LIST_directory').html());
                contents.find('.LIST_directory_path').html(me.getPath());
                contents.attr('data-mpd_file_path', me.getPath());
                return contents;
            }

            return me;
        }
    }

    /**
     * update our UI on a state change
     */
    function updateState(state, client){
        $('input.MPD_volume').val(client.getVolume());

        if(client.getPlaystate() == 'play'){
            //show pause
            $('.MPD_play').hide();
            $('.MPD_pause').show();
        }
        else{
            //show play
            $('.MPD_play').show();
            $('.MPD_pause').hide();
        }

        var current_song = client.getCurrentSong();
        if(current_song){
            $('.MPD_controller_current_song_title').html(current_song.getDisplayName());
            $('.MPD_controller_current_song_artist').html(current_song.getArtist());
            $('.MPD_controller_current_song_album').html(current_song.getAlbum());

            $('.MPD_queue [data-mpd_queue_song_id]').removeClass('selected');
            $('.MPD_queue [data-mpd_queue_song_id="'+client.getCurrentSongID()+'"]').addClass('selected');

            //there is a mix of div/span/td type html and input/select typeelements
            $('.MPD_controller_current_song_duration').html(formatTime(current_song.getDuration()));
            $('input.MPD_seek').prop('max',current_song.getDuration());
            $('input.MPD_seek').val(Math.round(client.getCurrentSongTime()));
        }

        //settings
        $('.MPD_setting [data-setting=repeat]').prop('checked',client.isRepeat());
        $('.MPD_setting [data-setting=single]').prop('checked',client.isSingle());
        $('.MPD_setting [data-setting=consume]').prop('checked',client.isConsume());
        $('.MPD_setting [data-setting=random]').prop('checked',client.isRandom());
        $('.MPD_setting [data-setting=crossfade]').val(client.getCrossfadeTime());

        while(UI.onChange.state.length > 0){
            UI.onChange.state.shift()();
        }
    }

    /**
     * update our UI on a Queue change
     */
    function updateQueue(queue, client){
        $('.MPD_queue').each(function(i,queue_element){
            queue_element.setItems(queue.getSongs());
        });
        $('.MPD_queue [data-mpd_queue_song_id="'+client.getCurrentSongID()+'"]').addClass('selected');

        if(queue.getSongs().length < 1){
            //if there are no songs, nothing is playing
            //we don't get a state change notification about this
            $('.MPD_play').show();
            $('.MPD_pause').hide();
        }


        while(UI.onChange.queue.length > 0){
            UI.onChange.queue.shift()();
        }
    }

    /**
     * update our UI on a playlist change
     */
    function updatePlaylists(playlists, client){
        var playlist_selector = $('.MPD_playlist select.MPD_playlist_list');
        var old_selected = playlist_selector.val();
        var option_code = '';
        playlists.forEach(function(playlist){
            option_code += '<option value="'+playlist.playlist+'">'+playlist.playlist+'</option>';
        });
        playlist_selector.html(option_code);
        if(old_selected !== null){
            playlist_selector.val(old_selected);
        }

        selectPlaylist(playlist_selector);

        while(UI.onChange.playlist.length > 0){
            UI.onChange.playlist.shift()();
        }
    }

    /**
     * update our UI for ticking of play time
     */
    function updatePlaytime(client){
        var current_song = client.getCurrentSong();
        if(current_song){
            //there is a mix of div/span/td type html and input/select typeelements
            $('input.MPD_seek').val(Math.round(client.getCurrentSongTime()));
            var formatted_time = formatTime(client.getCurrentSongTime());
            $('.MPD_controller_current_song_time').html(formatted_time);
        }
    }

    /**
     * update our UI for ticking of play time
     */
    function updatePageTitle(client){
        if(typeof updatePageTitle.offset === 'undefined'){
            updatePageTitle.offset = 0;
        }
        var current_song = client.getCurrentSong();
        if(current_song){
            var title = current_song.getDisplayName()+' - ';
            if(current_song.getArtist()){
                title += current_song.getArtist()+' - ';
            }
            updatePageTitle.offset++;
            if(updatePageTitle.offset > title.length){
                updatePageTitle.offset = 0;
            }

            document.title = title.substring(updatePageTitle.offset)+title.substring(0,updatePageTitle.offset);
        }
        else{
            document.title = 'MPD Client';
        }
    }

    /**
     * look for the 'nearest' element matching the passed selector
     */
    function searchUp(element, selector){
        var elements = $($(element).parents().addBack().get().reverse());
        element = null;
        elements.each(function(i, test_element){
            var maybe = $(test_element).find(selector);
            if(maybe.length > 0){
                element = maybe;
                return false;
            }
        });
        return element;
    }

    /**
     * gets the appropriate client
     */
    function getClient(){
        return UI.client;
    }

    /**
     * assuming this element is under a playlist, get the playlist
     */
    function getPlaylist(element){
        return $(element).closest('.MPD_playlist').data('playlist');
    }

    /**
     * given a number print out a nicer looking string with minutes/hours/seconds
     */
    function formatTime(seconds, precision){
        if(typeof precision === 'undefined'){
            precision = 0;
        }
        var minutes = Math.floor(seconds/60);
        seconds -= minutes*60;

        //hey, it could happen
        var hours = Math.floor(minutes/60);
        minutes -= hours*60;

        //not doing days

        //special formatting on seconds becaue they might be fractional
        var text_seconds = ('00'+Math.floor(seconds)).slice(-2); //leftpadded whole number part
        if(precision > 1){
            text_seconds += (seconds-Math.floor(seconds)).toFixed(precision); //decimal part
        }

        if(hours){
            return hours+':'+('00'+minutes).slice(-2)+':'+text_seconds;
        }
        else if(minutes){
            return minutes+':'+text_seconds;
        }
        else{
            return seconds.toFixed(precision);
        }
    }

    /**
     * setup elements that are supposed have a marque effect when they overflow
     */
    function setupMarque(){
        function updateMarqueEffect(element){
            if(!element.updating){
                if(!element.timer){
                    element.timer =setTimeout(function(){
                        element.updating = true;
                        $(element).find('.copy').remove();
                        if($(element).width() < $(element).children().width()){
                            //turn on the marque effect
                            startMarque($(element));
                        }
                        else{
                            //turn off the marque effect
                            stopMarque($(element));
                        }
                        delete element.timer;
                        delete element.updating;
                    },100);
                }
            }
        }

        //wrap the element in a outter div
        var element = $('.marque_overflow');
        element.removeClass('marque_overflow');
        element.wrap('<div class="marque_overflow"></div>');

        $('.marque_overflow').on('DOMSubtreeModified',function(){
            updateMarqueEffect(this);
        });
        $(window).resize(function(){
            $('.marque_overflow').each(function(i,element){
                updateMarqueEffect(element);
            })
        });
    }

    /**
     * turn on marque
     */
    function startMarque(element){
        //first thing, duplicate the content
        var content = element.children('div');
        content.find('.copy').remove();//get rid of already copied stuff if it exsists
        content.html(content.html().replace(/\s+/g,'&nbsp;'));
        content.append('<span class="copy" style="margin:0 30px;">'+content.html()+'</span>');

        if(!content.is(':animated')){
            (function doAnimation(){
                content.css({'left':0});
                content.animate({'left': '-'+(content.width()/2)}, content.width()*10, 'linear', doAnimation);
            })();
        }
    }

    /**
     * turn on marque
     */
    function stopMarque(element){
        var content = element.children('div');
        content.find('.copy').remove();//get rid of already copied stuff if it exsists
        content.stop();
        content.css({'left':0});
        //element.removeClass('marquee_effect');
    }

    /**
     * given a select element and an array of contents fill the select element
     */
    function fillSelect(select_element, contents){
        var options_code = '';
        contents.forEach(function(option){
            if(typeof option === 'object'){
                options_code += '<option value="'+option.value+'">'+option.display+'</option>';
            }
            else{
                options_code += '<option value="'+option+'">'+option+'</option>';
            }
        });
        $(select_element).html(options_code);
    }

    /**
     * given an element find a parent element that has the given data
     */
    function getData(element, data){
        var data_element = $(element).closest('[data-'+data+']');
        return data_element.data(data);
    }

    /******************\
    |* public methods *|
    \******************/

    /**
     * start playing
     * element -- the element that triggered the event (tells us which client to use)
     */
    function play(element){
        getClient().play();
    }

    /**
     * start playing the song from an element in a list
     * element -- the element that triggered the event (tells us which client to use)
     */
    function playQueueSong(element){
        getClient().playById(getData(element, 'mpd_queue_song_id'));
    }

    /**
     * pause playback
     * element -- the element that triggered the event (tells us which client to use)
     */
    function pause(element){
        getClient().pause();
    }


    /**
     * stop playing
     * element -- the element that triggered the event (tells us which client to use)
     */
    function stop(element){
        getClient().stop();
    }


    /**
     * revert to the previous song
     * element -- the element that triggered the event (tells us which client to use)
     */
    function previous(element){
        getClient().previous();
    }


    /**
     * skip to the next song
     * element -- the element that triggered the event (tells us which client to use)
     */
    function next(element){
        getClient().next();
    }


    /**
     * element -- the element that triggered the event (tells us which client to use)
     */
    function setVolume(element){
        getClient().setVolume($(element).val());
    }


    /**
     * element -- the element that triggered the event (tells us which client to use)
     */
    function seek(element){
        getClient().seek($(element).val());
    }


    /**
     * element -- the element that triggered the event (tells us which playlist to use)
     */
    function loadPlaylist(element){
        var playlist = getPlaylist(element);
        playlist.load();
        $('.UI_main .TAB_control .TAB_button[data-tab_page=queue]').click();
    }


    /**
     * element -- the element that triggered the event (tells us which playlist to use)
     */
    function selectPlaylist(element){
        //normalize to the jquery object
        select_element = $(element);
        var playlist_element = $(element).closest('.LIST_container.MPD_playlist');

        //if nothing is selected don't go into what would be an error condition
        if(select_element && select_element.val() !== ''){

            //figure out which playlist is selected
            var playlist_id = select_element.val();

            //ask the MPD client to load the selected playlist
            getClient().getPlaylist(
                playlist_id,
                function(playlist){

                    //draw the now loaded playlist if we got one
                    if(playlist){
                        playlist_element.each(function(i,e){
                            e.setItems(playlist.getSongs());
                        });
                    }

                    playlist_element.data('playlist', playlist);
                }
            );

            //clear the list while we wait for the responce
            playlist_element.each(function(i,e){
                e.setItems([]);
            });
        }
    }


    /**
     * removes the currently playing song from the queue
     */
    function removeCurrentQueueSong(element){
        var mpd_client = getClient();
        mpd_client.removeSongsFromQueueById(mpd_client.getCurrentSongID());
    }


    /**
     * emptys all songs from the play queue
     */
    function clearQueue(element){
        getClient().clearQueue();
    }


    /**
     * toggle showing children, if no chilrent populate from the client
     */
    function fileListClick(element){
        var parent = $(element).closest('.LIST_directory');
        if(parent.length === 0){
            return;
        }
        var children = parent.find('.MPD_directory_children').first();
        if(children.length > 0 && children.children().length == 0){
            //element hasn't been populated yet
            populateFileList(parent);
        }

        //expanded == showing child nodes
        //collapsed == hidden
        //neither of these == just showing it's self

        parent.find('.LIST_directory').removeClass('expanded');
        parent.find('.LIST_directory').removeClass('collapsed');
        parent.siblings().removeClass('expanded');
        parent.siblings().addClass('collapsed');
        parent.addClass('expanded');
    }

    /**
     * given a filelist element get it's full path
     */
    function getFileListPath(element){
        var path = $(element).closest('[data-mpd_file_path]').data('mpd_file_path');
        return path?path:'';
    }


    /**
     * fill the given file list element with it's appropriate filey goodness
     */
    function populateFileList(element, data){
        var path = getFileListPath(element);
        getClient().getDirectoryContents(path, function(directory_contents){
            directory_contents.forEach(function(content){
                //remove the parent file path from the child
                var content_ui = content.getItemUI();
                if(content_ui.data('mpd_file_path')){
                    //this is only for directories
                    var relative_path = content_ui.data('mpd_file_path').replace(path+'/', '');
                    content_ui.find('.LIST_directory_path').html(relative_path);
                }
                //append the directory to it's parent's children
                $(element).find('.MPD_directory_children').first().append(content_ui);
            });
        });
    }


    /**
     * add all songs under this directory to the queue
     */
    function addDirectoryToQueue(element){
        var path = getFileListPath(element);
        getClient().addSongToQueueByFile(path);
    }


    /**
     * add a song by it's filename
     */
    function addSongToQueue(element){
        getClient().addSongToQueueByFile(getData(element, 'mpd_file_name'));
    }


    /**
     * add a song by it's filename, and play it
     */
    function addSongToQueueAndPlay(element){
        addSongToQueue(element);
        //when the queue changes play the last song
        UI.onChange.queue.push(
            function(){
                var queue = getClient().getQueue();
                queue.getSongs()[queue.getSongs().length-1].play();
            }
        );
    }

    /**
     * remove a song from the queue
     */
    function removeQueueSong(element){
        var data_element = $(element).closest('[data-mpd_queue_song_id]');
        getClient().removeSongFromQueueById(data_element.data('mpd_queue_song_id'));
    }

    /**
     *clear the queue
     */
    function clearQueue(element){
        if(confirm("Are you sure you want to empty the play Queue?")){
            getClient().clearQueue();
        }
    }

    /**
     * save the queue to some playlist
     */
    function saveQueueAsPlaylist(element){
        var playlist_name = '';
        while(playlist_name === ''){
            playlist_name = prompt('Playlist Name to save the Queue as');
        }
        //if the user clicked cancel don't do anything
        if(playlist_name === null){
            return;
        }
        getClient().saveQueueToPlaylist(playlist_name);
    }

    /**
     * completely delete the current playlist
     */
    function deletePlaylist(element){
        var playlist = getPlaylist(element);
        if(confirm('Are you sure you want to DELETE the Playlist "'+playlist.getName()+'"?')){
            playlist.delete();
            $('.MPD_playlist_list').val("option:first");
        }
    }

    /**
     * a setting changed
     */
    function settingChange(element){
        var which_setting = $(element).data('setting');
        var value = $(element).is('input[type=checkbox]')?$(element).attr('checked'):$(element).val();
        //jquery on the subject of checkboxes: "because fuck your consistency and fuck you!"
        switch(which_setting){
            case 'repeat':
                if(value){
                    getClient().enableRepeatPlay();
                }
                else{
                    getClient().disableRepeatPlay();
                }
            break;
            case 'single':
                if(value){
                    getClient().enableSinglePlay();
                }
                else{
                    getClient().disableSinglePlay();
                }
            break;
            case 'consume':
                if(value){
                    getClient().enablePlayConsume();
                }
                else{
                    getClient().disablePlayConsume();
                }
            break;
            case 'random':
                if(value){
                    getClient().enableRandomPlay();
                }
                else{
                    getClient().disableRandomPlay();
                }
            break;
            case 'crossfade':
                value = Math.floor(value);
                value = value?value:0;
                getClient().setCrossfade(value);
            break;
            default:
                throw new Error('Unknown setting: "'+which_setting+'"');
            break;
        }
    }

    /* search stuff */

    /**
     * get the search criteria from the search form
     */
    function getSearchCriteria(stop_at){
       var params = {}
       //iterate over the rows of the form to get the search parameters
       $('.MPD_search .SEARCH_criteria tr').each(function(i, row){
           var tag = $(row).find('.SEARCH_criteria_type').val();
           var val = $(row).find('.SEARCH_criteria_value').val();
           if(stop_at == tag){
               return false;
           }
           params[tag] = val;
       });
       return params;
    }

    /**
     * element -- the element that triggered the event (tells us which playlist to use)
     */
    function addSearchCriteria(element){
        var options = UI.client.getTagTypes();
        var options_code = '';
        var exsisting_types = Object.keys(getSearchCriteria());
        options.forEach(function(option){
            //don't add criteria that's already there
            //except 'any' let them have asn many anys as they want
            if(option == 'any' || exsisting_types.indexOf(option) === -1){
                options_code += '<option value="'+option+'">'+option+'</option>';
            }
        });

        var criteria_contents = $($('#template_SEARCH_criteria').html());
        criteria_contents.find('.SEARCH_criteria_type').html(options_code);
        criteria_contents.find('.SEARCH_criteria_type').val('any');
        criteria_contents.find('.SEARCH_criteria_value').attr('type','text');

        $('.MPD_search .SEARCH_criteria').append(criteria_contents);
     }

     /**
      * update the search criteria value editor associated with the given tag type selector
      */
    function updateSearchEditor(element, onComplete){
        var target = $(element).closest('tr').find('.SEARCH_criteria_value');
        var tag = $(element).val();

        //remove all criteria type options that have been selected elsewhere from all criteria type selectors, except unless they are the source of that criteria type
        var options = UI.client.getTagTypes();
        $('.MPD_search .SEARCH_criteria tr').each(function(i, row){
            var options_code = '';
            var old_val = $(row).find('.SEARCH_criteria_type').val();
            var selected_value = $(row).find('.SEARCH_criteria_value').val();
            var params = getSearchCriteria(old_val);
            options.forEach(function(option){
                if(option == 'any' || option == old_val || Object.keys(params).indexOf(option) === -1){
                    options_code += '<option value="'+option+'">'+option+'</option>';
                }
            });
            $(row).find('.SEARCH_criteria_type').html(options_code);
            $(row).find('.SEARCH_criteria_type').val(old_val);
        });

        var params = getSearchCriteria(tag);
        var exsisting_types = Object.keys(params);

        //the meat of this function
        if(['any','title', 'track', 'date', 'file'].indexOf(tag) === -1){   //NOT one of these
            //if the tag is one that there might be a limited number of results for, fetch the valid results from MPD
            if(typeof params[tag] !== 'undefined'){
                delete params[tag];
            }
            UI.client.tagSearch(
                tag,
                params,
                function(options){
                    var options_code = '';
                    options.forEach(function(option){
                        options_code += '<option value="'+option+'">'+option+'</option>';
                    });
                    target.replaceWith('<select class="SEARCH_criteria_value" onchange="UI.onSearchCriteriaValueChange(this);">'+options_code+'</select>');
                    if(onComplete){
                        onComplete();
                    }
                }
            );
        }
        else{
            //otherwise just use a freeform text box
            target.replaceWith('<input class="SEARCH_criteria_value" type="text" onchange="UI.onSearchCriteriaValueChange(this);"></input>');
            if(onComplete){
                onComplete();
            }
        }
    }

    /**
     * remove the row of the passed element
     */
    function removeSearchCriteria(element){
        var next = $(element).next();
        $(element).parents('form tr').remove();
        onSearchCriteriaValueChange(next);
    }

    /**
     * perform a search with the criteria in the form
     */
    function doSearch(element){
       var params = getSearchCriteria();
       UI.client.search(params, function(results){
           var options_code = '';
           results.forEach(function(result){
               $('.MPD_search .SEARCH_results').append(result.getItemUI());
           });
       });
    }

    /**
     * removes all criteria, then re-adds one
     * I almost always hate 'reset form' buttons, but I think it might be worth it here for a change
     */
    function resetSearch(element, suppress_warning){
        if(!suppress_warning){
            if(!confirm('are you sure you want to reset the search form?')){
                return;
            }
        }
        $('.MPD_search .SEARCH_criteria tr').remove();
        addSearchCriteria(element);
    }

    /**
     * called when the criteria value changes, makes sure supsequent criteria are properly constrained
     */
    function onSearchCriteriaValueChange(element){
        var next = $(element).closest('tr').next();
        function doNext(){
            if(next.length > 0){
                updateSearchEditor($(next).find('.SEARCH_criteria_type'), doNext);
                next = next.next();
            }
        }
        doNext();
    }

    /**
     *
     */
    function appendSearchResultsToQueue(element){
        var result_element = $(element).parents('.MPD_search').find('.SEARCH_results');
        result_element.find('[data-mpd_file_path]').each(function(garbage,song_element){
            getClient().addSongToQueueByFile($(song_element).data(mpd_file_path));
        });
    }

    /**
     *
     */
    function appendSearchResultsToPlaylist(element){
        var playlist = prompt('Name of the playlist');
        if(playlist === null){
            return;
        }
        var result_element = $(element).parents('.MPD_search').find('.SEARCH_results');
        result_element.find('[data-mpd_file_path]').each(function(garbage,song_element){
            getClient().addSongToPlaylistByFile(playlist, $(song_element).data(mpd_file_path));
        });
    }

    /**
     *
     */
    function addSongToPlaylist(element){
        var playlist = prompt('Name of the playlist to add to');
        if(playlist === null){
            return;
        }
        var song_path = $(element).closest('[data-mpd_file_name]').data('mpd_file_name');
        getClient().addSongToPlaylistByFile(playlist, song_path);
    }


    return {
        play:play,
        pause:pause,
        stop:stop,
        previous:previous,
        next:next,
        setVolume:setVolume,
        seek:seek,
        playQueueSong:playQueueSong,
        loadPlaylist:loadPlaylist,
        selectPlaylist:selectPlaylist,
        removeCurrentQueueSong:removeCurrentQueueSong,
        clearQueue:clearQueue,
        fileListClick:fileListClick,
        removeQueueSong:removeQueueSong,
        clearQueue:clearQueue,
        addSongToQueue:addSongToQueue,
        addSongToQueueAndPlay:addSongToQueueAndPlay,
        addSongToPlaylist:addSongToPlaylist,
        saveQueueAsPlaylist:saveQueueAsPlaylist,
        deletePlaylist:deletePlaylist,
        addDirectoryToQueue:addDirectoryToQueue,
        settingChange:settingChange,
        addSearchCriteria:addSearchCriteria,
        updateSearchEditor:updateSearchEditor,
        removeSearchCriteria:removeSearchCriteria,
        doSearch:doSearch,
        resetSearch:resetSearch,
        onSearchCriteriaValueChange:onSearchCriteriaValueChange,
        appendSearchResultsToQueue:appendSearchResultsToQueue,
        appendSearchResultsToPlaylist:appendSearchResultsToPlaylist
    };
})();
