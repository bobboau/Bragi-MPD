var UI = (function(){

    /**
     * mapping between html classnames and MPD client methods to call to update them
     */

    var UI = {
        clients: [],
        active_client:0,
        onChange:{
            state:[],
            queue:[],
            playlist:[]
        },
        history_state:[],
        active_history_state:-1,
        last_clicked_file_element:null
    };

    /********\
    |* INIT *|
    \********/

    $(function(){
        //try to load custom configuration
        //when done (wether it succeeds or fails) init the page
        $.getScript( "config.js" ).done(init).fail(init);
    });

    /**
     * one time setup function
     */
    function init(){
        //load theme if it exsists
        if(CONFIG.theme){
            CONFIG.theme.forEach(function(theme_file){
                $('<link>')
                    .appendTo('head')
                    .attr({type : 'text/css', rel : 'stylesheet'})
                    .attr('href', theme_file);
            });
        }

        setupFeatureDisabling();

        overrideMpd();

        setupInstances();

        $(".LIST_queue_find_value").keyup(function(e){
            queueFindchange(e.target, e);
        });
        $(".MPD_queue .LIST_contents").on('scroll', function(e){
            $(".MPD_queue .LIST_contents .found").removeClass('found');
        });
        $(".MPD_search form [name=hide_queue_songs]").on('click',function(){
            var parent = $(this).closest('.MPD_search');
            if($(this).is(':checked')){
                parent.addClass('hide_on_queue');
            }
            else{
                parent.removeClass('hide_on_queue');
            }
        });

        CONFIG.clients.forEach(function(client_config, idx){

            var client = setupClient(client_config, idx);

            client.on('StateChanged',updateState);

            client.on('QueueChanged',updateQueue);

            client.on('OutputChanged',updateOutputs);

            client.on('PlaylistsChanged',updatePlaylists);

            client.on('DataLoaded', updateFiles);

            client.on('Connect', onConnect);

            client.on('Disconnect', onDisconnect);

            client.on('Error', onError);

            client.on('AuthFailure', onAuthFailure);

            UI.clients.push(client);
        });


        setInterval(function(){
            updatePlaytime(getClient());
        },150);

        if(!mobileCheck()){
            setInterval(function(){
                updatePageTitle(getClient());
            },250);
        }

        //setup event handlers for marque elements
        setupMarque();
    }

    /*******************\
    |* private methods *|
    \*******************/

    /**
     * make sure the given input is a string
     */
    function stringClean(str){
        if(!str){
            return '';
        }
        else{
            return str+'';
        }
    }

    /**
     * go through the list of config features and add css rules for all disabled features
     */
    function setupFeatureDisabling(){
        var disable_styles = '';
        CONFIG.clients.forEach(function(config,idx){
            var disabled_selectors = flattenFeatureConfig(config.disabled_features);
            disabled_selectors.forEach(function(selector){
                disable_styles += '\n[data-active_client="'+idx+'"] '+selector+'{\n\tdisplay:none !important;\n}\n'
            });
        });
        if(disable_styles !== ''){
            //if we got any, make a new style element in the head with the rules in them
            $('head').append('<style>'+disable_styles+'</style>');
        }
    }

    /**
     * take a feature config object and return a simple set of css selectors
     */
    function flattenFeatureConfig(config){
        if(typeof config === 'undefined'){
            return [];
        }
        else if(typeof config === 'string' || config instanceof String){
            return [config];
        }
        else if(Object.prototype.toString.call(config) === '[object Array]'){
            return config;
        }
        else if(config === Object(config)){
            var out = [];
            for(var key in config){
                var val = config[key];
                if(typeof val === 'boolean'){
                    out.push(key);
                }
                else{
                    val = flattenFeatureConfig(val);
                    out.push.apply(out,val.map(function(d){return key+' '+d;}));
                }
            }
            return out;
        }
        else{
            throw new Error('unsupported feature config format');
        }
    }

    /**
     * read from the config and make a client
     */
    function setupClient(client_config, idx){
        var password = localStorage.getItem('password_'+client_config.name);
        if(!password){
            if(client_config.needs_auth){
                password = prompt(client_config.name+" needs a password");
                localStorage.setItem('password_'+client_config.name, password);
            }
        }
        else{
            client_config.needs_auth = true; //has a password, so it must have needed it at one point
        }

        if(!password){
            password = undefined;
        }
        var client = MPD(client_config.port, client_config.hostname, password);

        client.name = client_config.name;
        client.idx = idx;
        client.needs_auth = client_config.needs_auth;

        if(client_config.local_volume) {
            client.local_volume = 1;
        }
        else{
            client.local_volume = 0;
        }

        if(client_config.stream_port) {
            client.stream_port = client_config.stream_port;
            //sometimes MPD.getHost() returns protocol and port, so we need to get rid of those
            var hostname = client.getHost().toLowerCase().replace('http://', '').replace('https://', '').split(':')[0];
            client.stream_url = 'http://' + hostname + ':' + client.stream_port + '/';
        }
        else{
            client.stream_port = 0;
            client.stream_url = '';
        }

        if(client.needs_auth){
            $('[data-instance_idx='+idx+'].INSTANCE_instance .INSTANCE_password').val(password);
        }
        else{
            $('[data-instance_idx='+idx+'].INSTANCE_instance .INSTANCE_password').closest('tr').css({display:'none'});
        }

        if(client_config.debug){
            client.enableLogging();
        }
        return client
    }

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
                contents.attr('data-mpd_songlist_position', me.getQueuePosition());
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
                contents.attr('data-mpd_file_path', me.getPath());
                contents.attr('data-mpd_songlist_position', me.getPlaylistPosition());
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
                contents.attr('data-mpd_file_path', me.getPath());
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
                contents.attr('data-mpd_file_path', me.getPath());
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
     * do the one time setup of multiple instances
     */
    function setupInstances(){
        if(CONFIG.clients.length === 1){
            //if there is only one instance there is no point in showing the instances tab
            //even 0 instances will show an error message
            $('.TAB_control [data-tab_page=instance].TAB_button').hide();
        }
        if(CONFIG.clients.length !== 0){
            $('.MPD_instances .empty').remove();
        }

        CONFIG.clients.forEach(function(client_config, idx){
            var contents = $($('#template_INSTANCE').html());
            if(idx === 0){
                contents.addClass('selected');
            }
            contents.attr('data-instance_idx', idx);
            contents.find('.INSTANCE_name').html(client_config.name);
            contents.find('.INSTANCE_port').html(client_config.port);

            if(client_config.hostname){
                contents.find('.INSTANCE_host').html(client_config.hostname);
            }
            else{
                contents.find('.INSTANCE_host').closest('tr').remove();
            }

            if(client_config.stream_port){
                contents.find('.INSTANCE_stream_port').html(client_config.stream_port);
            }
            else{
                contents.find('.INSTANCE_stream_port').closest('tr').remove();
            }

            if(client_config.local_volume){
                contents.find('.INSTANCE_local_volume').html('Yes');
            }
            else{
                contents.find('.INSTANCE_local_volume').html('No');
            }

            var connection_element = contents.find('.INSTANCE_connection_status');
            connection_element.html('Not Connected!');
            connection_element.addClass('bad');
            $('.MPD_instances').append(contents);
        });
        $('body').attr('data-active_client',0);
    }

    /**
     * update our UI on a state change
     */
    function updateState(state, client){
        if(client != getClient()){
            return;
        }

        var stream = $('audio.MPD_stream')[0];
        if(client.stream_port){
            var no_cache = '?no_cache=';
            var current_url = stream.src.split(no_cache, 2)[0];

            //reload stream if changing instance (and thus url) or if there was an error that UI.streamError() gave up on
            if((current_url != client.stream_url) || stream.error){
                stream.src = client.stream_url + no_cache + Math.random() * 99999999;
                stream.load();
            }
        }

        var playing = (client.getPlaystate() == 'play');

        if(playing){
            //show pause
            $('.MPD_play').hide();
            $('.MPD_pause').show();

            //make sure the stream keeps playing
            stream.play();
        }
        else{
            //show play
            $('.MPD_play').show();
            $('.MPD_pause').hide();

            //stop the stream and prevent buffering by setting empty source.
            //not ideal as this causes a delay when playing again.
            //nevertheless, better than pausing and having sound totally out of sync when playing again.
            stream.src = '';
        }

        var volume;
        if(client.local_volume){
            volume = localStorage.getItem('setting_local_volume');
            if(volume === null){
                volume = 0.5;
            }
            stream.volume = volume;

            if(playing && stream.src && stream.paused){
                //show the user that we don't have permission to play the stream by putting the slider at the bottom
                volume = 0;
            }
        }
        else{
            volume = client.getVolume();
        }
        $('input.MPD_volume').val(volume);

        var current_song = client.getCurrentSong();
        if(current_song){
            $('.MPD_controller_current_song_title').html(stringClean(current_song.getDisplayName()));
            $('.MPD_controller_current_song_artist').html(stringClean(current_song.getArtist()));
            $('.MPD_controller_current_song_album').html(stringClean(current_song.getAlbum()));

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

        if(document.hidden && updateState.last_state && updateState.last_state.current_song.id != state.current_song.id){
            showNotification(
                current_song.getDisplayName(),
                'by: '+current_song.getArtist()
            )
        }

        updateState.last_state = state;
    }

    /**
     * update our UI for outputs
     */
    function updateOutputs(outputs, client){
        if(client != getClient()){
            return;
        }
        $('.MPD_outputs').empty();
        if(outputs.length == 1){
            //if there is only one then there really isn't any need for this tab
            $('.TAB_control [data-tab_page=output].TAB_button').css({display:'none'});
        }
        else{
            $('.TAB_control [data-tab_page=output].TAB_button').css({display:''});
            outputs.forEach(function(output){
                var contents = $($('#template_OUTPUT').html());
                contents.attr('data-output_id', output.getId());
                contents.find('.OUTPUT_name').html(output.getName());
                if(output.isEnabled()){
                    contents.addClass('selected');
                    contents.find('.OUTPUT_enabled').html('Yes');
                    contents.find('.OUTPUT_enabled').addClass('good');
                }
                else{
                    contents.removeClass('selected');
                    contents.find('.OUTPUT_enabled').html('No');
                    contents.find('.OUTPUT_enabled').addClass('bad');
                }
                $('.MPD_outputs').append(contents);
            });
        }
    }

    /**
     * update our UI on a Queue change
     */
    function updateQueue(queue, client){
        if(client != getClient()){
            return;
        }
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

        calculateOnQueueSearchResults();
    }

    /**
     * update our UI on a playlist change
     */
    function updatePlaylists(playlists, client){
        if(client != getClient()){
            return;
        }
        var playlist_selector = $('.MPD_playlist select.MPD_playlist_list');
        var old_selected = playlist_selector.val();
        if(updatePlaylists.on_update_select){
            old_selected = updatePlaylists.on_update_select;
            delete updatePlaylists.on_update_select;
        }
        var option_code = '';
        playlists.forEach(function(playlist){
            option_code += '<option value="'+playlist+'">'+playlist+'</option>';
        });
        playlist_selector.html(option_code);
        if(old_selected !== null && playlist_selector.find('option[value="'+old_selected+'"]').length){
            playlist_selector.val(old_selected);
        }

        selectPlaylist(playlist_selector);

        while(UI.onChange.playlist.length > 0){
            UI.onChange.playlist.shift()();
        }
    }

    /**
     * setup the file browser
     */
    function updateFiles(state,client){
        if(client != getClient()){
            return;
        }
        var element = $('.MPD_file_placeholder');
        if(element.length){
            //manually make the file root if it does not exsist
            var contents = $($('#template_LIST_directory').html());
            element.replaceWith(contents);
        }
        else{
            //empty out anexsisting root
            $('[data-tab_page=files] .LIST_directory .MPD_directory_children').empty();
        }

        //populate the file root
        var root = $('[data-tab_page=files] .LIST_directory');
        if(UI.last_clicked_file_element === null){
            UI.last_clicked_file_element = root;
        }
        populateFileList(root);
        //the root is treated differently than the rest of the oflders
        //you can't close it and it shouldn't have the common tools
        //because 'add all music' is a sort of dangerous button on root
        root.addClass('expanded root');
        root.find('.LIST_directory_path').html('Music Files');
        root.find('.MPD_button').remove();
        resetSearch(null, true);
    }

    /**
     * called when a client (re)connects
     */
    function onConnect(connect_event, client){
        var element = $('[data-instance_idx='+client.idx+'] .INSTANCE_connection_status');
        element.html('Connected!');
        element.addClass('good');
        element.removeClass('bad');
        if(client == getClient()){
            $('.MPD_disconnected').css({display:'none'});
        }
    }

    /**
     * called when a client disconnects
     */
    function onDisconnect(disconnect_event, client){
        var element = $('[data-instance_idx='+client.idx+'] .INSTANCE_connection_status');
        element.html('Not Connected!');
        element.addClass('bad');
        element.removeClass('good');
        if(client == getClient()){
            $('.MPD_disconnected').css({display:''});
        }
    }

    /**
     * called when an error happens
     */
    function onError(error, client){
        debugger;
        alert('***ERROR*** '+error.message);
    }

    /**
     * called when some sort of permissions issue arizes
     */
    function onAuthFailure(error, client){
        var instance_element = $('[data-instance_idx='+client.idx+'].INSTANCE_instance');
        var password =  localStorage.getItem('password_'+client.name);
        // we\the user tried to do something we are not allowed to do
        if(UI.clients.length === 1){
            var password = prompt('please enter a password');
            localStorage.setItem('password_'+client.name, password);
            client.authorize(password);
        }
        else{
            if(client === getClient() && client.last_failed_password != password ){
                alert('Your password was rejected for '+client.name);
            }
            instance_element.find('.INSTANCE_password').closest('tr').css({display:''});
            instance_element.find('.INSTANCE_password_message').html('(rejected)');
            client.last_failed_password = password;
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
     *return true if this is a mobile device
     */
    function mobileCheck() {
        var check = false;
        (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
        return check;
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
        return UI.clients[UI.active_client];
    }

    /**
     * assuming this element is under a playlist or a queue, get it
     */
    function getSonglist(element){
        var playlist = $(element).closest('.MPD_playlist').data('playlist');
        if(playlist){
            return playlist;
        }
        return getClient().getQueue();
    }

    /**
     * assuming this element is under a playlist, get the playlist
     */
    function getPlaylist(element){
        return $(element).closest('.MPD_playlist').data('playlist');
    }

    /**
     * maybe show a notification if they ever settle on a consistent API
     */
    function showNotification(title, body){
        try{
            if(Notification.permission === "granted" && localStorage.getItem('setting_notifications') == 'true'){
                var n = new Notification(
                    title,
                    {
                        body:body,
                        icon: '/img/bragi-192.png'
                    }
                );
                setTimeout(n.close.bind(n), 4000);

                if(showNotification.last_notification){
                    setTimeout(showNotification.last_notification.close.bind(showNotification.last_notification), 4);
                }
                showNotification.last_notification = n;
            }
        }
        catch(err){
            console.log(err);
        }
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

    /**
     * set the active client to the one specified
     */
    function setInstance(idx){
        if(idx === UI.active_client){
            return;
        }
        UI.active_client = idx;
        var client = getClient();

        //Reset current song data. It's strange to keep the data if
        //the new instance don't have a curent song
        $('.MPD_controller_current_song_title').empty();
        $('.MPD_controller_current_song_artist').empty();
        $('.MPD_controller_current_song_album').empty();
        $('.MPD_controller_current_song_time').empty();
        $('.MPD_controller_current_song_duration').empty();
        $('input.MPD_seek').prop('max', 100);
        $('input.MPD_seek').val(0);

        $('audio.MPD_stream').prop('src', '');

        //update the UI
        $('.INSTANCE_instance').removeClass('selected');
        $('[data-instance_idx='+idx+'].INSTANCE_instance').addClass('selected');
        if(client.isConnected()){
            updateState(client.getState(), client);
            updateQueue(client.getQueue(), client);
            updatePlaylists(client.getPlaylists(), client);
            updateOutputs(client.getOutputs(), client);
            $('.MPD_disconnected').css({display:'none'});
        }
        else{
            $('.MPD_disconnected').css({display:''});
        }

        $('body').attr('data-active_client',idx);
    }

    /**
     * scrolls the given song
     */
    function scrollToSong(song_id, position){
        var queue_element = $('.MPD_queue .LIST_content_container');
        var song_element = $('.MPD_queue .LIST_content_container [data-mpd_queue_song_id='+song_id+']');

        queue_element.animate({
            scrollTop: queue_element.scrollTop() + song_element.position().top - queue_element.height()*position
        }, 500);
    }

    /**
     * find songs on the queue
     */
    function queueFind(value){
        value = value.toLowerCase();
        //the songs on the queue that have the search criteria
        return $('.MPD_queue .LIST_content_container .LIST_song')
            .filter(function(){
                return $(this).find('.LIST_song_title, .LIST_song_artist, .LIST_song_album')
                    .filter(function(){
                        return $(this).html().toLowerCase().indexOf(value) > -1;
                    }
                ).length > 0;
            });
    }


    /**
     * update the on_queue class of all the songs in search results
     */
    function calculateOnQueueSearchResults(){
        var queue_songs = getClient().getQueue().getSongs().map(function(song){
            return song.getPath();
        });
        $('.MPD_search .SEARCH_results .LIST_song').each(function(i,element){
            element = $(element);
            var song_path = element.data('mpd_file_path');
            if(queue_songs.indexOf(song_path) === -1){
                element.removeClass('on_queue');
            }
            else{
                element.addClass('on_queue');
            }
        });
    }

    /******************\
    |* public methods *|
    \******************/

    /**
     *wrapper for the history.pushState method
     *history.pushState cannot handle functions or DOM elements or lots of things,
     *but it CAN handle an index to another array that CAN handle it
     */
    function pushState(title){
        history.pushState(UI.history_state.length, title);
        UI.history_state.length = UI.active_history_state+1;
        UI.history_state.push({
            client_idx: UI.active_client,
            tabs: TABS.getActiveTabs(),
            file_element:UI.last_clicked_file_element
        });
        UI.active_history_state = UI.history_state.length-1;
    }

    window.addEventListener("popstate", function(event){
        if(event.state === null){
            history.back();//skip the "initial" state
            return;
        }
        UI.active_history_state = event.state;
        var state = UI.history_state[UI.active_history_state];
        setInstance(state.client_idx);
        fileListClick(state.file_element);
        TABS.setActiveTabs(state.tabs);
    });

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
        var client = getClient();
        var volume = $(element).val();
        var stream = $('audio.MPD_stream')[0];

        //use volume slider to get permission to play on mobile
        if(client.stream_port && stream.src){
            stream.play();
        }

        if(client.local_volume){
            stream.volume = volume;
            localStorage.setItem('setting_local_volume', volume);
        }
        else{
            stream.volume = 1;
            client.setVolume(volume);
        }
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
    function appendPlaylist(element){
        var playlist = getPlaylist(element);
        playlist.appendToQueue();
        $('.UI_main .TAB_control .TAB_button[data-tab_page=queue]').click();
    }


    /**
     * element -- the element that triggered the event (tells us which playlist to use)
     */
    function loadPlaylist(element){
        var playlist = getPlaylist(element);
        playlist.loadIntoQueue();
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
     * scrolls the queue to the currently playing song
     */
    function showCurrenSong(element){
        var mpd_client = getClient();
        var song_id = mpd_client.getCurrentSongID();
        scrollToSong(song_id, 0.5);
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
        UI.last_clicked_file_element = element;
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
                    var file_path = content_ui.data('mpd_file_path');
                    //if file_path is a number (e.g. "311"), we need to convert to a string first
                    var relative_path = null;
                    if( typeof(file_path) == "number" )
                    {
                        relative_path = file_path.toString().replace(path+'/', '');
                    }
                    else
                    {
                        relative_path = file_path.replace(path+'/', '');
                    }
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
     * add all songs under this directory to a playlist
     */
    function addDirectoryToPlaylist(element){
        var playlist_name = '';
        while(playlist_name === ''){
            playlist_name = prompt('Playlist Name to save the Queue as');
        }
        //if the user clicked cancel don't do anything
        if(playlist_name === null){
            return;
        }

        var path = getFileListPath(element);
        getClient().addSongToPlaylistByFile(playlist_name, path);
    }


    /**
     * add a song by it's filename
     */
    function addSongToQueue(element){
        getClient().addSongToQueueByFile(getData(element, 'mpd_file_path'));
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
     * change the name of the current playlist
     */
    function renamePlaylist(element){
        var playlist = getPlaylist(element);
        var playlist_name = playlist.getName();
        do{
            playlist_name = prompt('New Playlist Name', playlist_name);
        }while(playlist_name === '');

        //if the user clicked cancel don't do anything
        if(playlist_name === null){
            return;
        }

        updatePlaylists.on_update_select = playlist_name;
        playlist.rename(playlist_name);
    }

    /**
     * a setting changed
     */
    function settingChange(element){
        var which_setting = $(element).data('setting');
        var value = $(element).is('input[type=checkbox]')?$(element).is(':checked'):$(element).val();
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
            case 'notifications':
                localStorage.setItem('setting_notifications', value?'true':'');
                if(value==true && Notification.permission !== "granted"){
                    Notification.requestPermission();
                }
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
       $('.MPD_search .SEARCH_criteria .SEARCH_criteria_row').each(function(i, row){
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
        var options = getClient().getTagTypes();
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
        var target = $(element).closest('.SEARCH_criteria_row').find('.SEARCH_criteria_value');
        var tag = $(element).val();

        //remove all criteria type options that have been selected elsewhere from all criteria type selectors, except unless they are the source of that criteria type
        var options = getClient().getTagTypes();
        $('.MPD_search .SEARCH_criteria .SEARCH_criteria_row').each(function(i, row){
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
            getClient().tagSearch(
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
        $(element).parents('form .SEARCH_criteria_row').remove();
        onSearchCriteriaValueChange(next);
    }

    /**
     * perform a search with the criteria in the form
     */
    function doSearch(element){
       var params = getSearchCriteria();
       $('.MPD_search .SEARCH_results').empty();
       getClient().search(params, function(results){
           var options_code = '';
           results.forEach(function(result){
               $('.MPD_search .SEARCH_results').append(result.getItemUI());
           });
           calculateOnQueueSearchResults();
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
        $('.MPD_search .SEARCH_criteria .SEARCH_criteria_row').remove();
        addSearchCriteria(element);
    }

    /**
     * called when the criteria value changes, makes sure supsequent criteria are properly constrained
     */
    function onSearchCriteriaValueChange(element){
        var next = $(element).closest('.SEARCH_criteria_row').next();
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
            getClient().addSongToQueueByFile($(song_element).data('mpd_file_path'));
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
            getClient().addSongToPlaylistByFile(playlist, $(song_element).data('mpd_file_path'));
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
        var song_path = $(element).closest('[data-mpd_file_path]').data('mpd_file_path');
        getClient().addSongToPlaylistByFile(playlist, song_path);
    }

    /**
     *
     */
    function removeSongFromPlaylist(element){
        var playlist = getPlaylist(element);
        var song_file = getData(element, 'mpd_file_path');
        var song_position = getData(element, 'mpd_songlist_position');
        if(confirm('Are you sure you want to remove the song "'+song_file+'" from the Playlist "'+playlist.getName()+'"?')){
            playlist.removeSongByPosition(song_position);
        }
    }

    /**
     * make the search criteria visible
     */
    function expandSearch(element){
        $('.SEARCH_criteria_control').css({display:''});
        $('.SEARCH_criteria').css({display:''});

        $('.MPD_button.SEARCH_expand').css({display:'none'});
        $('.MPD_button.SEARCH_collapse').css({display:''});

    }

    /**
     * make the search criteria invisible
     */
    function collapseSearch(element){
        $('.SEARCH_criteria_control').css({display:'none'});
        $('.SEARCH_criteria').css({display:'none'});

        $('.MPD_button.SEARCH_expand').css({display:''});
        $('.MPD_button.SEARCH_collapse').css({display:'none'});
    }

    /**
     * what's playing now sucks, I don't want to hear it anymore
     */
    function removeCurrenSong(element){
        getClient().removeSongFromQueueById(client.getCurrentSongID());
    }

    /**
     * set the active client to the one that was just clicked on
     */
    function selectInstance(element){
        var idx = $(element).closest('[data-instance_idx]').data('instance_idx');
        setInstance(idx);
    }

    /**
     * set a password for an instance
     */
    function setPassword(element){
        var password = $(element).val();
        var idx = $(element).closest('[data-instance_idx]').data('instance_idx');
        var client = UI.clients[idx];
        $(element).closest('[data-instance_idx]').find('.INSTANCE_password_message').html('');
        localStorage.setItem('password_'+client.name, password);
        client.authorize(password);
    }

    /**
     * turn this output on, and all the others off
     */
    function switchToOutput(element){
        var output_id = $(element).closest('[data-output_id]').data('output_id');

        var outputs = getClient().getOutputs();
        outputs.forEach(function(output){
            if(output_id === output.getId()){
                output.enable();
            }
        });
        outputs.forEach(function(output){
            if(output_id !== output.getId()){
                output.disable();
            }
        });
    }

    /**
     * turn on this output
     */
    function enableOutput(element){
        var output_id = $(element).closest('[data-output_id]').data('output_id');
        var output = getClient().getOutputs()[output_id];
        output.enable();
    }

    /**
     * turn off this output
     */
    function disableOutput(element){
        var output_id = $(element).closest('[data-output_id]').data('output_id');
        var output = getClient().getOutputs()[output_id];
        output.disable();
    }

    /**
     * given an item on a queue/playlist swap it with the previous one
     */
    function moveItemUp(element){
        var songlist = getSonglist(element);
        var position = getData(element, 'mpd_songlist_position');
        songlist.moveSongByPosition(position, position-1);
    }

    /**
     * given an item on a queue/playlist swap it with the next one
     */
    function moveItemDown(element){
        var songlist = getSonglist(element);
        var position = getData(element, 'mpd_songlist_position');
        songlist.moveSongByPosition(position, position+1);
    }

    /**
     * given an item on a queue/playlist move it somewhere else
     */
    function moveItemStartReorder(element){
        var songlist = getSonglist(element);
        var position = getData(element, 'mpd_songlist_position');

        var list_element = $(element).closest('.LIST_contents');
        var element_overlay = $(element).closest('.LIST_item').find('.LIST_overlay');
        var other_overlays = list_element.find('.LIST_overlay').not(element_overlay);

        //setup the cancel overlay on the origonal element
        element_overlay.css({display:'', 'cursor': 'pointer', 'border-color':'white', 'border-style': 'dashed'});
        element_overlay.find('.LIST_overlay_message').html('Click Here to Cancel Move');
        element_overlay.on('click',function(){cancelReorder(element);});

        //set up the swap, move before and move after buttons on every other overlay
        other_overlays.css({display:''});
        //swap
        var button = other_overlays.find('.LIST_overlay_message');
        button.html('Swap with this song');
        button.on('click',function(){
            var other_position = getData(this, 'mpd_songlist_position');
            songlist.swapSongsByPosition(position, other_position);
        });
        button.css({'background-color':'rgba(255,255,255,0.25)', 'cursor': 'pointer', 'border-radius':'10px'});
        //before
        var button = other_overlays.find('.LIST_overlay_header');
        button.html('&uarr; Move Before This Song &uarr;');
        button.on('click',function(){
            var other_position = getData(this, 'mpd_songlist_position');
            if(other_position > position){
                songlist.moveSongByPosition(position, other_position-1);
            }
            else{
                songlist.moveSongByPosition(position, other_position);
            }
        });
        button.css({'background-color':'rgba(255,255,255,0.25)', 'cursor': 'pointer', 'border-radius':'10px'});
        //after
        var button = other_overlays.find('.LIST_overlay_footer');
        button.html('&darr; Move After This Song &darr;');
        button.on('click',function(){
            var other_position = getData(this, 'mpd_songlist_position');
            if(other_position > position){
                songlist.moveSongByPosition(position, other_position);
            }
            else{
                songlist.moveSongByPosition(position, other_position+1);
            }
        });
        button.css({'background-color':'rgba(255,255,255,0.25)', 'cursor': 'pointer', 'border-radius':'10px'});
    }

    /**
     * stop trying to reorder things
     */
    function cancelReorder(element){
        var overlays = $(element).closest('.LIST_contents').find('.LIST_overlay');
        //remove ALL event handlers from ALL overlay elements
        overlays.off();
        overlays.find('*').off();
        //clear everything in the message
        overlays.find('.LIST_overlay_message').html('');
        //remove all special formatting
        overlays.removeAttr('style')
        //hide the overlays
        overlays.css({display:'none'});
    }

    /**
     * show the find uI hide the regular
     */
    function showQueueFind(element){
        $('.MPD_queue .LIST_header.LIST_song_toolbar').css({display:'none'});
        $('.MPD_queue .LIST_queue_find_toolbar').css({display:''});
        $('.LIST_queue_find_value').val('');
        $('.LIST_queue_find_value').focus();
    }

    /**
     * hide the fine UI show the regular
     */
    function hideQueueFind(element){
        $('.MPD_queue .LIST_header.LIST_song_toolbar').css({display:''});
        $('.MPD_queue .LIST_queue_find_toolbar').css({display:'none'});
    }

    /**
     * find things on the queue before what's shown
     */
    function queueFindPrev(element){
        queueFindNext(element,true);
    }

    /**
     * find things on the queue after what's shown
     */
    function queueFindNext(element, reverse){

        var value = $('.LIST_queue_find_value').val();
        if('' === value){
            return;
        }

        var queue_element = $('.MPD_queue .LIST_content_container');

        //the songs on the queue that have the search criteria
        var songs = queueFind(value);
        if(reverse){
            songs = $(songs.get().reverse());
        }

        //if nothing was found do nothing
        if(songs.length > 0){
            //try to get songs after the queue's current offset
            var after_songs = songs;
            if(songs.filter('.found').length){
                if(reverse){
                    after_songs = songs.filter(':not(.found~*),:not(.found)');
                }
                else{
                    after_songs = songs.filter('.found~*');
                }
            }
            after_songs = after_songs.filter(function() {
                if(reverse){
                    return $(this).position().top < queue_element.position().top;
                }
                else{
                    return $(this).position().top > queue_element.position().top;
                }
            });

            var song_element = null;
            //if nothing after go to the first one
            if(after_songs.length > 0){
                song_element = $(after_songs[0]);
            }else{
                song_element = $(songs[0]);
            }
            $('.MPD_queue .LIST_content_container .LIST_song').removeClass('found');
            song_element.addClass('found');
            scrollToSong(song_element.data('mpd_queue_song_id'), 0.5);
        }
    }

    /**
     * move to the next thing matching including what is on the screen already
     */
    function queueFindchange(element, event){

        if(27 === event.which){
            hideQueueFind(element);
            return;
        }

        var value = $('.LIST_queue_find_value').val();
        if('' === value){
            return;
        }

        if(13 === event.which){
            queueFindNext(element, event.shiftKey);
            return;
        }

        var queue_element = $('.MPD_queue .LIST_content_container');

        //the songs on the queue that have the search criteria
        var songs = queueFind(value);

        //if nothing was found do nothing
        if(songs.length > 0){
            //try to get songs after the queue's current offset
            var after_songs = songs.filter(function() {
                return $(this).position().top >= queue_element.position().top;
            });

            var song_element = null;
            //if nothing after go to the first one
            if(after_songs.length > 0){
                song_element = $(after_songs[0]);
            }else{
                song_element = $(songs[0]);
            }
            $('.MPD_queue .LIST_content_container .LIST_song').removeClass('found');
            song_element.addClass('found');
            scrollToSong(song_element.data('mpd_queue_song_id'), 0.5);
        }
    }

    /**
     * handle stream errors
     */
    function streamError(stream){
        var current_time = new Date().getTime();
        if(typeof streamError.lastError == 'undefined'){
            streamError.lastError = current_time;
        }
        //reset error counter when last error is more than 1 minute ago
        if((typeof streamError.errorCounter == 'undefined') || (current_time - streamError.lastError > 60000)){
            streamError.errorCounter = 0;
        }

        //reload the stream only if it has a source and it seems online
        if(stream.src && (streamError.errorCounter < 10)){
            streamError.errorCounter++;
            stream.load();
            stream.play();
        }
    }

    return {
        pushState:pushState,
        play:play,
        pause:pause,
        stop:stop,
        previous:previous,
        next:next,
        setVolume:setVolume,
        seek:seek,
        playQueueSong:playQueueSong,
        appendPlaylist:appendPlaylist,
        loadPlaylist:loadPlaylist,
        selectPlaylist:selectPlaylist,
        removeCurrentQueueSong:removeCurrentQueueSong,
        showCurrenSong:showCurrenSong,
        clearQueue:clearQueue,
        fileListClick:function(element){
            fileListClick.apply(this,arguments);
            this.pushState($(element).find('.LIST_directory_path').html());
        },
        removeQueueSong:removeQueueSong,
        clearQueue:clearQueue,
        addSongToQueue:addSongToQueue,
        addSongToQueueAndPlay:addSongToQueueAndPlay,
        addSongToPlaylist:addSongToPlaylist,
        removeSongFromPlaylist:removeSongFromPlaylist,
        saveQueueAsPlaylist:saveQueueAsPlaylist,
        deletePlaylist:deletePlaylist,
        renamePlaylist:renamePlaylist,
        addDirectoryToQueue:addDirectoryToQueue,
        addDirectoryToPlaylist:addDirectoryToPlaylist,
        settingChange:settingChange,
        addSearchCriteria:addSearchCriteria,
        updateSearchEditor:updateSearchEditor,
        removeSearchCriteria:removeSearchCriteria,
        doSearch:doSearch,
        resetSearch:resetSearch,
        onSearchCriteriaValueChange:onSearchCriteriaValueChange,
        appendSearchResultsToQueue:appendSearchResultsToQueue,
        appendSearchResultsToPlaylist:appendSearchResultsToPlaylist,
        expandSearch:expandSearch,
        collapseSearch:collapseSearch,
        removeCurrenSong:removeCurrenSong,
        selectInstance:selectInstance,
        setPassword:setPassword,
        switchToOutput:switchToOutput,
        enableOutput:enableOutput,
        disableOutput:disableOutput,
        moveItemUp:moveItemUp,
        moveItemDown:moveItemDown,
        moveItemStartReorder:moveItemStartReorder,
        cancelReorder:cancelReorder,
        showQueueFind:showQueueFind,
        hideQueueFind:hideQueueFind,
        queueFindPrev:queueFindPrev,
        queueFindNext:queueFindNext,
        queueFindchange:queueFindchange,
        streamError:streamError
    };
})();
