require 'agric/compiler'

desc "Compile font Agric #{Agric::VERSION}"
task :compile do
  Agric::Compiler.compile!
end

# task :build => :compile
