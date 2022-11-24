#!/usr/bin/perl

use lib "./";
use utf8;
use Web::Scraper;
use Data::Dumper;
require "lib.pl";
binmode STDOUT, 'utf8';

# Get the file to process
$file = $ARGV[0];

# If the file exists
if(-e $file){

	# Open the file
	open(FILE,"<:utf8",$file);
	@lines = <FILE>;
	close(FILE);
	$str = join("",@lines);

	#$str =~ s/[\n\r]/ /g;
#	$str =~ s/[\s]{2,}/ /g;
	$str =~ s/\&nbsp;/ /g;

	@entries = ();
#
	if($str =~ s/<script type="application\/json" data-drupal-selector="drupal-settings-json">(.*?)<\/script>//s){
		$json = JSON::XS->new->decode($1);
		@features = @{$json->{'leaflet'}{'leaflet-map-view-localgov-directory-channel-embed-map'}{'features'}};

		for($i = 0; $i < @features; $i++){
			$d = {};
			if($features[$i]{'lat'}){ $d->{'lat'} = $features[$i]{'lat'}+0; }
			if($features[$i]{'lon'}){ $d->{'lon'} = $features[$i]{'lon'}+0; }
			if($features[$i]{'label'}){ $d->{'title'} = $features[$i]{'label'}; }

			if($features[$i]{'popup'}){
				if($features[$i]{'popup'} =~ /<a href="([^\"]+)"/){
					$d->{'url'} = $1;
					if($d->{'url'} =~ /^\//){ $d->{'url'} = "https://www.redcar-cleveland.gov.uk".$d->{'url'}; }
				}
				if($features[$i]{'popup'} =~ /<div class="field field--name-localgov-directory-opening-times field--type-text-long field--label-hidden field__item">(.*?)<\/div>/s){
					$d->{'hours'} = $1;
					$d->{'hours'} =~ s/<[^\>]+>/ /g;
					$d->{'hours'} = parseOpeningHours({'_text'=>trimText($d->{'hours'})});
				}
				if($features[$i]{'popup'} =~ /<div class="field field--name-localgov-location field--type-entity-reference field--label-hidden field__item">(.*?)<\/div>/s){
					$d->{'address'} = $1;
					$d->{'address'} =~ s/[\n\r]/, /g;
				}
				push(@entries,makeJSON($d,1));
			}
		}
	}

	open(FILE,">:utf8","$file.json");
	print FILE "[\n".join(",\n",@entries)."\n]";
	close(FILE);

	print $file.".json";

}else{

	print "";

}

