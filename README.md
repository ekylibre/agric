# Agric [![Build Status](https://travis-ci.org/ekylibre/agric.png)](https://travis-ci.org/ekylibre/agric)

Agriculture-oriented iconic web font. Based on Font Awesome 4.

## Compilation

Agric is composed of many fonts. To merge them in one consistent set, many tools are used:

    cd compiler
    sudo apt-get install nodejs npm fontforge
    sudo npm install -g svg-font-dump svg-font-create svgo@0.4.4
    npm install svg-font-dump svg-font-create svgo@0.4.4

If you don't have Node JS in your distribution you can compile it easily from its sources.

## Installation

Add this line to your application's Gemfile:

    gem 'agric'

And then execute:

    $ bundle

Or install it yourself as:

    $ gem install agric

