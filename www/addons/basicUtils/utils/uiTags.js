/**=====LICENSE STATEMENT START=====
    Translator++ 
    CAT (Computer-Assisted Translation) tools and framework to create quality
    translations and localizations efficiently.
        
    Copyright (C) 2018  Dreamsavior<dreamsavior@gmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
=====LICENSE STATEMENT END=====*/
// Tagging related UI

var UiTags = function(options) {
	this.options = options || {};
	this.options.options = this.options.options || $(`
			<div class="actionSet">
				<label class="flex"><input type="radio" name="exportTagAction" data-mark="cross" class="actionBlacklist" value="blacklist" /> <span>Do not process row with selected tag (blacklist)</span></label>
				<label class="flex"><input type="radio" name="exportTagAction" data-mark="check" class="actionWhitelist" value="whitelist" /> <span>Only process row with selected tag (whitelist)</span></label>
				<label class="flex"><input type="radio" name="exportTagAction" data-mark="unknown" class="actionNone" value="" /> <span>Ignore tag</span></label>
			</div>`);
	this.element = $();
	this.init.apply(this, arguments);
	this.reset();
	this.element.options = this.options;
	require("www/js/BasicEventHandler.js").applyTo(this);
}

UiTags.prototype.init = function() {
	this.element = $("<div class='uiTags uiTagsWrapper'></div>");
	//if (this.element.hasClass("rendered")) return this.element;
	
	for (var colorName in consts.tagColor) {
		var $temp = $('<input type="checkbox" value="'+colorName+'" />');
		$temp.addClass("colorTagSelector tagSelector");
		$temp.addClass(colorName);
		$temp.css("background-color", consts.tagColor[colorName]);
		$temp.attr("title", colorName)
		$temp.attr("name", "tagSelector");
		this.element.append($temp);
	}
	this.element.addClass("rendered")
	this.element.append(this.options.options);

	var that = this;
	this.element.attr("data-mark", "unknown");
	this.element.find("input").on("change", function() {
		var $this = $(this);
		that.element.attr("data-mark", $this.attr("data-mark"));
		that.trigger("change", that.value());
	});
	
	var $loadSaved = $(`<div class="fieldgroup">
		<button class="loadLastSelection">${t('Load last selection')}</button>
		<button class="resetField">${t('Reset')}</button>
	</div>`);
	$loadSaved.find(".loadLastSelection").on("click", ()=> {
		console.log("clicked");
		this.fillField()
	});
	$loadSaved.find(".resetField").on("click", ()=> {
		console.log("clicked");
		this.resetField()
	});
	
	this.element.append($loadSaved);
	
	if (this.options.default) {
		console.log("option default are set");
		this.fillField(this.options.default);
	}

	return this.element;
}

UiTags.prototype.reset = function() {
	this.element.find(".colorTagSelector").prop("checked", false);
	this.element.find(".actionNone").prop("checked", true);
	return this.element;
}

UiTags.prototype.$ = function() {
	return this.element;
}

UiTags.prototype.value = function(initValue) {
	if (!initValue) {
		const tags = [];
		$.each(this.element.find(".tagSelector:checked"), function(){            
			tags.push($(this).val());
		});
		
		const filterTagMode = this.element.find("input[type='radio']:checked").val();
		return {
			filterTag : tags,
			filterTagMode : filterTagMode
		}
	}
}

UiTags.prototype.getValue = function(options) {
	options 			= options || {}
	// prompt for error?
	options.noPrompt 	= options.noPrompt || false;
	options.persist 	= options.persist !== false;
	var tags = [];
	$.each(this.element.find(".tagSelector:checked"), function(){            
		tags.push($(this).val());
	});
	
	var filterTagMode = this.element.find("input[type='radio']:checked").val();
	if (!options.noPrompt) {
		if (tags.length > 0 && filterTagMode=="") {
			var conf = confirm("You selected one or more tags, but the action is 'none'.\nYour selected tags will not affect anything.\n\nDo you wish to continue?");
			if (conf == false) return false;
		}
	}
	var result = {
		filterTag : tags,
		filterTagMode : filterTagMode
	}
	if (options.persist) {
		this.saveValue(result);
	}
	return result;
}

UiTags.prototype.saveValue = function(result) {
	console.log("Saving value", result)
	if (!result) return;
	var val = JSON.stringify(result)
	localStorage.setItem('uiTags', val)
	return val;
}

UiTags.prototype.loadValue = function() {
	try {
		var data = localStorage.getItem('uiTags');
		return JSON.parse(data);
	} catch (e) {
		console.warn(e);
	}

	return {filterTag:[]}
}

UiTags.prototype.resetField = function(ignoreEvent) {
	this.$().find(".colorTagSelector").prop("checked", false);
	this.$().find("input[type='radio'].actionNone").prop("checked", true);
	this.$().find("input[type='radio']:checked").prop("checked", false);
	if (!ignoreEvent) this.trigger("change", this.value());
}

UiTags.prototype.fillField = function(val, options) {
	options = options || {};
	options.persist = options.persist !== false;
	val = val || this.loadValue() || {};
	val.filterTag = val.filterTag || [];
	console.log("filling field with value : ", val);
	
	this.resetField();
	
	
	for (let i in val.filterTag) {
		if (!val.filterTag[i]) continue;
		console.log(val.filterTag[i], "length", this.$().find(".colorTagSelector."+val.filterTag[i]).length);
		this.$().find(".colorTagSelector."+val.filterTag[i]).prop("checked", true);
	}
	
	if (val.filterTagMode) {
		console.log("filling filterTagMode", val.filterTagMode);
		this.$().find("input[value="+val.filterTagMode+"]").prop("checked", true)
	}
	this.trigger("change", this.getValue({noPrompt:true, persist:options.persist}));

}



var UiTagSelector = function($elm, options) {
	this.$elm 				= $elm;
	this.options 			= options || {};
	this.options.default;
	this.init();
}

UiTagSelector.prototype.on = function(evt, fn) {
    this.$elm.on(evt, fn)
}

UiTagSelector.prototype.off = function(evt, fn) {
    this.$elm.off(evt, fn)
}

UiTagSelector.prototype.one = function(evt, fn) {
    this.$elm.one(evt, fn)
}

UiTagSelector.prototype.trigger = function(evt, param) {
    this.$elm.trigger(evt, param)
}

UiTagSelector.prototype.openDialog = async function(defaultVal) {
	console.log("openDialog default:", defaultVal);
	this.$popup = $(`<div class="dialogSelectTags" id="mini-dialogSelect"></div>`);
	this.lastTags = new UiTags({options:$(), 'default':defaultVal});
	window.lastTag = this.lastTags;
	this.$popup.append(this.lastTags.element);
	var confirm = false;
	this.$popup.dialog({
		title:"Select Tags",
		autoOpen: false,
		modal:true,
		closeOnEscape:true,
		//width:Math.round($(window).width()/100*80),
		//height:Math.round($(window).height()/100*80),
		width:300,
		height:160,
		minWidth:300,
		minHeight:160,
		show: {
			effect: "fade",
			duration: 200
		},
		hide: {
			effect: "fade",
			duration: 200
		},
		open: (event, ui) => { 
			if (defaultVal) this.lastTags.fillField(defaultVal);
			console.log(this.$popup.find('.ui-widget-overlay'));
			this.$popup.find('.ui-widget-overlay').one('click', () => {
				console.log("clicked");
				this.$popup.dialog('close'); 
			}); 
		},
		buttons:[
			{
				text: t("Cancel"),
				icon: "ui-icon-close",
				click: function() {
					$(this).dialog( "close" );
				}
			},			
			{
				text: t("Confirm"),
				icon: "ui-icon-plus",
				click: function() {
					confirm = true;
					$(this).dialog( "close" );
				}
			}

		]
	});
	return new Promise((resolve, reject) => {
		$( ".selector" ).dialog( "option", "classes.ui-dialog", "mini" );
		this.$popup.on( "dialogclose", ()=>{
			console.log("last tag value", this.lastTags.getValue());
			if (confirm) {
				var value = this.lastTags.getValue();
				this.$popup.remove();
				return resolve(value);
			} else {
				this.$popup.remove();
				resolve();
			}
		});

		this.$popup.dialog("open");
	})
}

UiTagSelector.prototype.resetVisual = function() {
	this.$visual.empty();
	this.$visual.text("click to add tags");
}

UiTagSelector.prototype.drawVisual = function(value) {
	value = value || this.value || {};
	console.log("drawing visual:", value);
	if (!value) return this.resetVisual();
	if (empty(value.filterTag)) return this.resetVisual();
	this.$visual.empty();
	console.log("tags are:", value.filterTag);
	for (var i=0; i<value.filterTag.length; i++) {
		var $template = $(`<span class="tag" data-type="tag"></span>`);
		$template.css("background", consts.tagColor[value.filterTag[i]]);
		$template.attr("title", value.filterTag[i]);
		this.$visual.append($template);
	}
}

UiTagSelector.prototype.getValue = function() {
	if (!this.value) return [];
	if (this.value.filterTag) return this.value.filterTag;
	return [];
}

UiTagSelector.standarizeValue = function(value) {
	var result = {
		filterTag : [],
		filterTagMode : undefined
	}
	if (empty(value)) return result;
	if (typeof value == "string") {
		result.filterTag = value.split(",");
	} else if (Array.isArray(value)) {
		result.filterTag = value;
	} else if (typeof value == "object") {
		if (!value.filterTag) {
			console.error("Unsupported object type:", value);
			return result;
		}
		return value;
	}

	return result;
}

UiTagSelector.prototype.val = function(setter) {
	if (typeof setter !== "undefined") {
		this.value = UiTagSelector.standarizeValue(setter);
		this.drawVisual();
		this.$elm.data("value", this.getValue());
		this.$elm.val(this.getValue().join(","));
		return;
	} else {
		return this.value;
	}
}

UiTagSelector.prototype.init = function() {
	this.$wrapper = $(`<div class="UiTagSelectorWrapper" title="click to edit"></div>`);
	this.$visual = $(`<div class="visual"></div>`);
	this.$wrapper.append(this.$visual);
	this.$elm.addClass("hidden");
	this.$elm.before(this.$wrapper);
	this.$wrapper.append(this.$elm);


	this.$visual.off("click");
	this.$visual.on("click", async () => {
		console.log("visual clicked");
		var tags = await this.openDialog(this.val());
		console.log("selected tags:", tags);
		if (tags) {
			this.val(tags);
			this.trigger("change");
			this.trigger("input");
		}
	});

	if (!empty(this.options.default)) {
		this.val(this.options.default);
	} else {
		this.drawVisual();
	}
}

window.UiTags = UiTags;
window.UiTagSelector = UiTagSelector;
$(document).ready(function() {
	$("head").append(`<style id="tagStyling">
	.UiTagSelectorWrapper .visual {
		display: inline-block;
		min-width: 120px;
		border: 1px solid #767676;
		/* min-height: 22px; */
		border-radius: 2px;
		color: #888;
		padding: 3px 4px 3px 4px;
		cursor:pointer;
		background: linear-gradient(to bottom, #ffffff 0%,#f3f3f3 50%,#ededed 51%,#ffffff 100%);
	}
	
	.UiTagSelectorWrapper .visual:hover {
		border: 1px solid #555;
	}

	[data-type="tag"] {
		display:inline-block;
		min-width:16px;
		min-height:16px;
		border-radius:50%;
		margin-right: 2px;
    	margin-left: 2px;
	}
</style>`);
})
