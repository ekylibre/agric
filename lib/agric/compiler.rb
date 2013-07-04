require 'rubygems'
require 'fileutils'
require 'yaml'
require 'nokogiri'
require 'agric'

module Agric
  module Compiler

    class << self

      def command(cmds)
        puts "$ " + cmds
        system(cmds)
      end
      
      SVG_NAMESPACES = {
        :dc => "http://purl.org/dc/elements/1.1/",
        :cc => "http://creativecommons.org/ns#",
        :rdf => "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        :svg => "http://www.w3.org/2000/svg",
        :sodipodi => "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
        :inkscape => "http://www.inkscape.org/namespaces/inkscape"
      }
      
      META = {
        :filename => "agric",
        :family => "Agric",
        :version => Agric::VERSION,
        :name => "agric"
      }

      def compile!(options = {})
        root = Agric.root
        sources = root.join("src")
        lib = root.join("lib")
        assets = lib.join("assets")
        compiler_dir = Pathname.new(File.expand_path(__FILE__)).dirname.join("compiler")
        convert_script = compiler_dir.join("convert.pe")

        output_font_file = assets.join("fonts", "#{META[:filename]}.svg")
        font_awesome_dir = Pathname.new(Dir.home).join(".font-awesome")
        glyphs = root.join("tmp", "glyphs")

        # Get latest Font-Awesome
        FileUtils.mkdir_p(font_awesome_dir.dirname)
        if font_awesome_dir.join(".git").exist?
          Dir.chdir(font_awesome_dir) do
            command("git pull")
          end
        else
          command("git clone git@github.com:FortAwesome/Font-Awesome.git #{font_awesome_dir}")
        end

        unless options[:explode].is_a?(FalseClass)

          # Normalize Font-Awesome
          awesome_dir = sources.join("001-awesome")
          FileUtils.rm_rf(awesome_dir)
          FileUtils.mkdir_p(awesome_dir)
          # FileUtils.cp(font_awesome_dir.join("build", "icons.yml"), awesome_dir.join("config.yml"))
          File.open(awesome_dir.join("config.yml"), "wb") do |f|
            icons = YAML.load_file(font_awesome_dir.join("src", "icons.yml"))
            # raise icons.inspect
            config = {"glyphs" => icons["icons"].collect{|h| {"css" => h["id"], "from" => "0x" + h["unicode"]} } }
            f.write(config.to_yaml)
          end

          forgotten_names = {
            "_279" => "info",
            "_283" => "eraser",
            "_303" => "rss_sign",
            "_312" => "external_link_sign",
            "_317" => "expand",
            "_329" => "sort_by_alphabet_alt",
            "_334" => "thumbs_up",
            "_335" => "thumbs_down",
            "_366" => "moon",
            "f0fe" => "plus_sign_alt",
            "f171" => "bitbucket"
          }

          # FileUtils.cp(font_awesome_dir.join("build", "assets", "font-awesome", "font", "fontawesome-webfont.svg"), awesome_dir.join("font.svg"))
          source = font_awesome_dir.join("src", "assets", "font-awesome", "font", "FontAwesome.otf")
          command("fontforge -script #{convert_script} #{source.to_s} svg")
          interm = source.dirname.join("FontAwesome.svg")
          File.open(interm) do |i|
            doc = Nokogiri::XML(i) do |config|
              config.nonet.strict.noblanks
            end
            doc.root.xpath("//glyph[@d]").each do |glyph|
              name = glyph.attr("glyph-name")
              name = forgotten_names[name] || name
              puts "   !Weird name: #{name}" unless name =~ /^[a-z0-9]+((\_|\-)[a-z0-9]+)*$/
              name.gsub!(/[^a-z0-9]+/, '-')
              glyph["glyph-name"] = name
            end
            doc.root.default_namespace = SVG_NAMESPACES[:svg]
            for name, url in SVG_NAMESPACES
              doc.root.add_namespace(name.to_s, url)
            end
            File.open(awesome_dir.join("font.svg"), "wb") do |f|
              f.write doc.to_s
            end
          end

          puts "-" * 80

          # Explodes all font characters in one dir
          FileUtils.rm_rf(glyphs)
          FileUtils.mkdir_p(glyphs)
          Dir.chdir(sources) do
            for font_fullname in Dir["*"].sort
              font_dir = sources.join(font_fullname)
              font_name = font_fullname.split("-")[1..-1].join("-")
              font_file = font_dir.join("font.svg")
              config_file = font_dir.join("config.yml")
              if font_file.exist? and config_file.exist?
                command("svg-font-dump -n -c #{config_file} -f -i #{font_file} -o #{glyphs} ")
              end
            end
          end

        end


        config_file = compiler_dir.join('config.yml')
        config = {
          "font" => {
            "version" => META[:version],
            "fontname" => META[:name],
            "fullname" => "#{META[:family]} (#{META[:name]})",
            "familyname" => META[:family],
            "copyright" => "Copyright (C) 2013 by #{META[:family]}",
            "ascent" => 850,
            "descent" => 150,
            "weight" => "Regular"
          }
        }

        reference_file = compiler_dir.join('reference.yml')
        reference = YAML.load_file(reference_file)

        icons = {}

        Dir.chdir(glyphs) do
          config["glyphs"] = Dir.glob("*.svg").sort.collect do |cf|
            name = cf.split(/\./).first
            if reference[name]
              icons[name] = reference[name]
            else
              last = reference.values.sort.last || "efff"
              icons[name] = last.to_i(16).succ.to_s(16)
              reference[name] = icons[name]
            end
            {"css" => name, "code" => last}
          end
        end
        
        # Removes undefined glyphs from reference
        for ref in reference.keys
          reference.delete(ref) unless icons.keys.include?(ref)
        end

        File.open(reference_file, "wb") do |f|
          f.write reference.to_yaml
        end

        File.open(config_file, "wb") do |f|
          f.write config.to_yaml
        end

        # Recompose font
        command("svg-font-create -c #{config_file} -s #{compiler_dir.join('svgo.yml')} -i #{glyphs} -o #{output_font_file}")

        puts "-" * 80


        # Convert SVG font to all needed format
        command("fontforge -script #{convert_script} #{output_font_file} ttf")
        command("fontforge -script #{convert_script} #{output_font_file} woff")
        command("fontforge -script #{convert_script} #{output_font_file} eot")
        command("rm -f #{output_font_file.dirname.join('*.afm')}")

        # Write SCSS file to manage list of icons
        File.open(lib.join("agric", "compass", "stylesheets", "agric", "_paths.scss"), "wb") do |f|
          f.write "@font-face {\n"
          f.write "  font-family: '#{META[:family]}';\n"
          f.write "  font-weight: normal;\n"
          f.write "  font-style: normal;\n"
          f.write "  src: font-url('#{META[:filename]}.eot?v=#{META[:version]}');\n"
          f.write "  src: font-url('#{META[:filename]}.eot?#iefix&v=#{META[:version]}') format('embedded-opentype'),\n"
          f.write "    font-url('#{META[:filename]}.woff?v=#{META[:version]}') format('woff'),\n"
          f.write "    font-url('#{META[:filename]}.ttf?v=#{META[:version]}') format('truetype'),\n"
          f.write "    font-url('#{META[:filename]}.svg?v=#{META[:version]}') format('svg');\n"
          f.write "}\n"
        end

        File.open(lib.join("agric", "compass", "stylesheets", "_icons.scss"), "wb") do |f|
          for name, code in icons
            f.write "$agric-icons-#{name}: \"#{code}\";\n"
            f.write ".icon-#{name}:before { content: $agric-icons-#{name} };\n"
          end
          # f.write "$agric-icons: (" + icons.collect{|k,v| "(#{k} \"\\#{v}\")"}.join(" ") + ");\n"
          # f.write "$agric-icons: (" + icons.collect{|k,v| "(#{k} \"\\#{v}\")"}.join(" ") + ");\n"
          # f.write "$agric-icon-names: (" + icons.keys.join(" ") + ");\n"
          # f.write "@mixin icon-agric(): (" + icons.keys.join(" ") + ");\n"
        end

      end



    end

  end
end
